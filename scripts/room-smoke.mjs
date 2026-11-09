#!/usr/bin/env node
/**
 * End-to-end smoke check for the room Worker.
 *
 * Starts `wrangler dev` for `workers/room` unless a local room server already
 * answers `/health`, then drives the real protocol with two clients and one
 * rejected third client. Exits non-zero on the first failed assertion.
 *
 * Run with Node 22+: `pnpm smoke:room`.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WRANGLER_BIN = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const CONFIG = 'workers/room/wrangler.jsonc'
const PORT = 8787
const HTTP_URL = `http://127.0.0.1:${PORT}`
const WS_URL = `ws://127.0.0.1:${PORT}`

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const START_TIMEOUT_MS = 120_000
const EVENT_TIMEOUT_MS = 10_000
const EARLY_CLOSE_GRACE_MS = 400

if (typeof WebSocket !== 'function') {
  console.error('✗ This script needs Node 22+ (global WebSocket is missing).')
  process.exit(1)
}

function makeRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let code = ''
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  return code
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Fails loudly for any non-2xx answer instead of parsing whatever came back. */
async function healthIsUp() {
  try {
    const response = await fetch(`${HTTP_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
}

async function startRoomServer(persistTo) {
  const child = spawn(
    process.execPath,
    [
      WRANGLER_BIN,
      'dev',
      '--config',
      CONFIG,
      '--local',
      '--port',
      String(PORT),
      '--persist-to',
      persistTo,
      '--log-level',
      'info',
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  const output = []
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))

  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev exited early:\n${output.join('')}`)
    }
    if (await healthIsUp()) return { child, output }
    await delay(500)
  }

  child.kill('SIGTERM')
  throw new Error(`wrangler dev did not answer ${HTTP_URL}/health:\n${output.join('')}`)
}

/** Buffers the server's JSON event arrays so tests can await specific events. */
class RoomClient {
  constructor(label) {
    this.label = label
    this.events = []
    this.closed = false
    this.socket = null
  }

  async open(code) {
    this.socket = new WebSocket(`${WS_URL}/ws?code=${code}`)
    this.socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data)
        if (Array.isArray(parsed)) this.events.push(...parsed)
        else this.events.push(parsed)
      } catch (error) {
        this.events.push({ t: 'unparseable', raw: event.data, error: String(error) })
      }
    })
    this.socket.addEventListener('close', () => {
      this.closed = true
    })

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.label}: socket did not open`)),
        EVENT_TIMEOUT_MS
      )
      this.socket.addEventListener('open', () => {
        clearTimeout(timer)
        resolve()
      })
      this.socket.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error(`${this.label}: socket error before open`))
      })
    })
    return this
  }

  send(message) {
    this.socket.send(JSON.stringify(message))
  }

  async waitFor(predicate, label) {
    const deadline = Date.now() + EVENT_TIMEOUT_MS
    while (Date.now() < deadline) {
      const found = this.events.find(predicate)
      if (found) return found
      await delay(25)
    }
    throw new Error(
      `${this.label}: timed out waiting for ${label}. Events seen: ${JSON.stringify(this.events)}`
    )
  }

  close() {
    try {
      this.socket?.close(1000, 'smoke done')
    } catch {
      // Already closed.
    }
  }
}

async function run(code) {
  console.log(`→ room ${code}`)

  const ana = await new RoomClient('ana').open(code)
  const beto = await new RoomClient('beto').open(code)

  try {
    return await driveRoom(code, ana, beto)
  } catch (error) {
    const dump = [ana, beto]
      .map((client) => `${client.label}: ${JSON.stringify(client.events)}`)
      .join('\n')
    throw new Error(`${error.message}\n--- client events ---\n${dump}`)
  } finally {
    ana.close()
    beto.close()
  }
}

async function driveRoom(code, ana, beto) {
  ana.send({ t: 'join', playerId: 'smoke-ana', name: 'Ana' })
  beto.send({ t: 'join', playerId: 'smoke-beto', name: 'Beto' })
  const lobby = await ana.waitFor(
    (event) => event.t === 'state' && event.room.players.length === 2,
    'state with two players'
  )
  assert(lobby.room.phase === 'lobby', 'room should be in the lobby after both joins')
  assert(
    lobby.room.players.some((player) => player.name === 'Ana') &&
      lobby.room.players.some((player) => player.name === 'Beto'),
    'both players should be listed'
  )
  console.log('✓ two players joined')

  // A third join must be refused with the room_full error.
  const carla = await new RoomClient('carla').open(code)
  carla.send({ t: 'join', playerId: 'smoke-carla', name: 'Carla' })
  const rejection = await carla.waitFor((event) => event.t === 'error', 'error for the third join')
  assert(
    rejection.code === 'room_full',
    `third join should fail with room_full, got ${rejection.code}`
  )
  carla.close()
  console.log('✓ third join rejected with room_full')

  // Nobody answered yet, so the round is open.
  ana.send({ t: 'start', count: 1 })
  const round = await ana.waitFor((event) => event.t === 'round', 'round event')
  assert(round.index === 0 && round.total === 1, 'count 1 should open exactly one round')
  assert(
    round.hint && typeof round.hint.spanish === 'string' && round.hint.base === undefined,
    'the round hint must never leak the answers'
  )
  console.log(`✓ round opened for "${round.hint.spanish}"`)

  // A single wrong answer must not close the round: the other player is pending.
  ana.send({ t: 'answer', index: 0, answers: { base: 'zzz', past: 'zzz', participle: 'zzz' } })
  const progress = await ana.waitFor((event) => event.t === 'progress', 'progress event')
  assert(progress.answered.length === 1, 'only one player answered')
  assert(progress.answered[0].correct === false, 'the wrong answer must be graded as incorrect')
  assert(!ana.events.some((event) => event.t === 'result'), 'the round closed before both answered')
  await delay(EARLY_CLOSE_GRACE_MS)
  assert(
    !ana.events.some((event) => event.t === 'result'),
    'the round closed while one player had not answered'
  )
  assert(!ana.events.some((event) => event.t === 'finished'), 'the game finished too early')
  console.log('✓ wrong answer kept the round open')

  beto.send({ t: 'answer', index: 0, answers: { base: 'zzz', past: 'zzz', participle: 'zzz' } })

  const result = await ana.waitFor((event) => event.t === 'result', 'result event')
  assert(result.winnerId === null, `nobody should win, got winnerId ${result.winnerId}`)
  assert(result.answers.length === 2, 'the result should carry both answers')
  assert(
    result.verb && result.verb.base && result.verb.past && result.verb.participle,
    'the result should reveal the full verb'
  )
  const finished = await ana.waitFor((event) => event.t === 'finished', 'finished event')
  assert(
    Object.values(finished.scores).every((score) => score === 0),
    `scores should stay at 0, got ${JSON.stringify(finished.scores)}`
  )
  assert(finished.players.length === 2, 'the finish payload should list both players')
  console.log('✓ round closed with no winner and the game finished at 0-0')

  // The other client must see the same outcome, not just the one that answered last.
  const betoFinished = await beto.waitFor((event) => event.t === 'finished', 'finished event')
  assert(
    JSON.stringify(betoFinished.scores) === JSON.stringify(finished.scores),
    'both clients should receive the same final scores'
  )
  console.log('✓ both clients received the same result')
}

async function main() {
  const code = makeRoomCode()
  let server = null
  const persistRoot = await mkdtemp(join(tmpdir(), 'english-game-room-'))

  try {
    if (await healthIsUp()) {
      console.log(`• using the room server already listening on ${HTTP_URL}`)
    } else {
      console.log('• starting wrangler dev for workers/room…')
      server = await startRoomServer(persistRoot)
      console.log(`• room server ready on ${HTTP_URL}`)
    }

    await run(code)
    console.log('PASS room smoke')
  } finally {
    if (server) {
      server.child.kill('SIGTERM')
      await delay(300)
      if (server.child.exitCode === null) server.child.kill('SIGKILL')
    }
    await rm(persistRoot, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(`✗ FAIL room smoke: ${error.message}`)
  process.exitCode = 1
})
