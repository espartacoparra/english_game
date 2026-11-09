#!/usr/bin/env node
/**
 * End-to-end smoke check for the room Worker.
 *
 * Starts its own `wrangler dev` for `workers/room` on a free localhost port (so
 * a stale dev server left on the default port can never answer in its place;
 * pin the port with `SMOKE_ROOM_PORT=…` when a fixed one is handier), then
 * drives the frozen wire contract (`app/core/room-protocol.ts`) with real Node
 * WebSocket clients, one room per scenario:
 *
 * 1. `lifecycle`   one room, two players: join, `state`, host-only start, a
 *                  `round` with a prompt, `progress` with `points`, a `result`
 *                  with `prompt`/`outcomes`/`solution`, `finished`.
 * 2. `roster`      one room, eight players: the ninth join is `room_full`, a
 *                  lone host cannot start (`below_min_players`), a non-host
 *                  cannot start (`not_host`), and a host leaving the lobby
 *                  hands the role to the next player in join order.
 * 3. `modes`       one room per game mode: the prompt family matches the mode,
 *                  the public prompt carries no answer, replies earn what they
 *                  are worth, and the round closes with `outcomes`+`solution`.
 * 4. `board`       three players: only the `turnPlayerId` may move, a wrong
 *                  pick passes the turn in join order, a pick out of turn is
 *                  refused with `not_your_turn`, and the board can be played to
 *                  its end.
 *
 * Every wait has a timeout that names the room, the mode and the step that did
 * not arrive. The first failure exits non-zero, closing every socket and
 * killing `wrangler dev`.
 *
 * Not every mode can be answered correctly from the outside: the verb forms
 * (`app/data/verbs.ts`) and the practice item pools (`app/data/practice.ts`)
 * are private server data, and this script is plain JavaScript on purpose, so it
 * cannot import them. Those modes assert what is provable instead (prompt shape,
 * family, leak check, wrong replies earning nothing, solution consistency) and
 * the run says so in its matrix. A multiple-choice option id is private too,
 * but four ids and four players reach it without guessing; the board reaches it
 * by trying the cards the prompt already shows.
 *
 * Run with Node 22+: `pnpm smoke:room`.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WRANGLER_BIN = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const CONFIG = 'workers/room/wrangler.jsonc'

/** The port to listen on: `SMOKE_ROOM_PORT`, or a free one the OS hands out. */
const REQUESTED_PORT = Number(process.env.SMOKE_ROOM_PORT ?? 0)

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const START_TIMEOUT_MS = 120_000
const WAIT_TIMEOUT_MS = 20_000
const EARLY_CLOSE_GRACE_MS = 400

/**
 * The seven modes and the prompt family each one is frozen into.
 * `app/core/room-protocol.ts` owns the four families; `workers/room/src/modes`
 * owns which mode plays which one.
 */
const FAMILY_BY_MODE = {
  'write-all': 'tenses',
  'fill-missing': 'tenses',
  synonyms: 'list',
  antonyms: 'list',
  cognates: 'choice',
  'false-cognates': 'choice',
  'card-matching': 'board',
}
const MODE_ORDER = [
  'write-all',
  'fill-missing',
  'synonyms',
  'antonyms',
  'cognates',
  'false-cognates',
  'card-matching',
]

/** The tenses a `tenses` prompt asks for, in the order the solution lists them. */
const TENSE_KEYS = ['base', 'past', 'participle']
/** The steps of a board chain, in order: the first pick opens a chain. */
const BOARD_STEPS = ['spanish', 'base', 'past', 'participle']
const BOARD_CARDS = 16
const BOARD_CHAINS = 4
const CHOICE_OPTIONS = 4
/** Hard stop for the board driver: 16 chains-steps plus bounded scanning. */
const BOARD_MAX_PICKS = 400

/** The exact public shape of each prompt family, straight from the contract. */
const PROMPT_KEYS = {
  tenses: ['kind', 'spanish', 'type', 'level', 'givenTense', 'givenForm'],
  choice: ['kind', 'item', 'question', 'hint', 'options'],
  list: ['kind', 'word', 'hint', 'expectedCount'],
  board: ['kind', 'cards', 'needed', 'turnPlayerId', 'completedChains', 'totalChains', 'chainsBy'],
}

/** Every client opened during the run, so a failure still closes all of them. */
const OPEN_CLIENTS = new Set()

if (typeof WebSocket !== 'function') {
  console.error('✗ This script needs Node 22+ (global WebSocket is missing).')
  process.exit(1)
}

/* --------------------------------------------------------------- utilities */

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let code = ''
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  return code
}

function normalized(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

/** The words a public value spells, so a leak check compares words, not substrings. */
function wordsOf(value) {
  switch (typeof value) {
    case 'string':
      return normalized(value).match(/[a-zà-ÿ0-9']+/g) ?? []
    case 'number':
    case 'boolean':
      return []
    case 'object': {
      if (value === null) return []
      if (Array.isArray(value)) return value.flatMap(wordsOf)
      return Object.values(value).flatMap(wordsOf)
    }
    default:
      return []
  }
}

/** The exact key set of a wire object, so a field that should not be public fails loudly. */
function assertKeys(context, object, keys, step) {
  assert(object && typeof object === 'object', `${context}: ${step} is not an object`)
  const actual = Object.keys(object).sort().join(',')
  const wanted = [...keys].sort().join(',')
  assert(actual === wanted, `${context}: ${step} must carry exactly ${wanted}, got ${actual}`)
}

/**
 * Fails when a word that only the closed round may reveal is already public.
 *
 * `secretWords` are the answers the round is about to grade; the prompt has no
 * business carrying any of them before the result.
 */
function assertNoLeak(context, step, prompt, secretWords) {
  const publicWords = new Set(wordsOf(prompt))
  for (const secret of secretWords) {
    const needle = normalized(secret)
    if (needle === '') continue
    assert(
      !publicWords.has(needle),
      `${context}: ${step} leaked the answer "${secret}" into the public prompt ${JSON.stringify(prompt)}`
    )
  }
}

/* ------------------------------------------------------------ room server */

let httpUrl = ''
let wsUrl = ''

/** A free localhost port, so a dev server already running on 8787 is never reused. */
async function findFreePort() {
  if (Number.isInteger(REQUESTED_PORT) && REQUESTED_PORT > 0) return REQUESTED_PORT
  return await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

async function healthIsUp() {
  try {
    const response = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(2000) })
    return response.ok
  } catch {
    return false
  }
}

async function startRoomServer(persistTo) {
  const port = await findFreePort()
  httpUrl = `http://127.0.0.1:${port}`
  wsUrl = `ws://127.0.0.1:${port}`

  const child = spawn(
    process.execPath,
    [
      WRANGLER_BIN,
      'dev',
      '--config',
      CONFIG,
      '--local',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--persist-to',
      persistTo,
      '--log-level',
      'info',
    ],
    // Its own process group: `wrangler dev` forks `workerd`, and a run that has
    // to escalate to SIGKILL must not leave that grandchild behind.
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true }
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

  await stopRoomServer({ child })
  throw new Error(`wrangler dev did not answer ${httpUrl}/health:\n${output.join('')}`)
}

/** True while any process of the child's group is still alive. */
function groupIsAlive(pid) {
  try {
    process.kill(-pid, 0)
    return true
  } catch {
    return false
  }
}

/** Shuts the dev server down, `workerd` included, escalating only when it must. */
async function stopRoomServer(server) {
  const child = server?.child
  if (!child) return
  for (const signal of ['SIGTERM', 'SIGKILL']) {
    if (!groupIsAlive(child.pid)) return
    try {
      process.kill(-child.pid, signal)
    } catch {
      child.kill(signal)
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await delay(100)
      if (!groupIsAlive(child.pid)) return
    }
  }
}

/* ---------------------------------------------------------------- clients */

/** One line per event, so a timeout can name what actually arrived. */
function summarize(event) {
  switch (event.t) {
    case 'state':
      return `state(${event.room.phase}, ${event.room.players.length}p, host=${event.room.hostId}, round=${event.room.roundIndex}, mode=${event.room.mode})`
    case 'round':
      return `round(${event.index}/${event.total}, ${event.prompt?.kind})`
    case 'progress':
      return `progress(${event.index}, ${event.answered.length} answered)`
    case 'result':
      return `result(${event.index}, winner=${event.winnerId})`
    case 'finished':
      return `finished(${JSON.stringify(event.scores)})`
    case 'error':
      return `error(${event.code})`
    default:
      return String(event.t)
  }
}

/**
 * Buffers the server's JSON event arrays in arrival order.
 *
 * `next()` streams: each call consumes every event up to the one it matched, so
 * "the next `progress`" means the one after the last consumed event and a round
 * that emits many events of the same kind is still readable.
 */
class RoomClient {
  constructor({ room, label, playerId, name }) {
    this.room = room
    this.label = label
    this.playerId = playerId
    this.name = name
    this.events = []
    this.cursor = 0
    this.waiters = []
    this.closed = false
    this.socket = null
  }

  get context() {
    return `${this.room}/${this.label}`
  }

  async open() {
    this.socket = new WebSocket(`${wsUrl}/ws?code=${this.room}`)
    this.socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(event.data)
        for (const item of Array.isArray(parsed) ? parsed : [parsed]) this.push(item)
      } catch (error) {
        this.push({ t: 'unparseable', raw: String(event.data), error: String(error) })
      }
    })
    this.socket.addEventListener('close', () => {
      this.closed = true
    })

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.context}: socket did not open within ${WAIT_TIMEOUT_MS}ms`)),
        WAIT_TIMEOUT_MS
      )
      this.socket.addEventListener('open', () => {
        clearTimeout(timer)
        resolve()
      })
      this.socket.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error(`${this.context}: socket error before open`))
      })
    })
    return this
  }

  send(message) {
    assert(!this.closed, `${this.context}: cannot send ${message.t} on a closed socket`)
    this.socket.send(JSON.stringify(message))
  }

  push(event) {
    this.events.push(event)
    if (this.waiters.length === 0) return

    const matched = this.waiters.filter((waiter) => waiter.predicate(event))
    if (matched.length === 0) return

    this.waiters = this.waiters.filter((waiter) => !matched.includes(waiter))
    this.cursor = this.events.length
    for (const waiter of matched) {
      clearTimeout(waiter.timer)
      waiter.resolve(event)
    }
  }

  history(limit = 8) {
    const tail = this.events.slice(-limit).map(summarize)
    return tail.length === 0 ? '(none)' : tail.join(', ')
  }

  /** The next event, from where the previous `next()` stopped, that matches. */
  async next(predicate, step) {
    for (let index = this.cursor; index < this.events.length; index += 1) {
      if (predicate(this.events[index])) {
        this.cursor = index + 1
        return this.events[index]
      }
    }

    return await new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null }
      waiter.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((entry) => entry !== waiter)
        reject(
          new Error(
            `${this.context}: timed out after ${WAIT_TIMEOUT_MS}ms waiting for ${step}. ` +
              `Last events: ${this.history()}`
          )
        )
      }, WAIT_TIMEOUT_MS)
      this.waiters.push(waiter)
    })
  }

  /** Whether an event ever arrived, with or without having been consumed. */
  has(predicate) {
    return this.events.some(predicate)
  }

  count(predicate) {
    return this.events.filter(predicate).length
  }

  latest(predicate) {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      if (predicate(this.events[index])) return this.events[index]
    }
    return null
  }

  close() {
    OPEN_CLIENTS.delete(this)
    try {
      this.socket?.close(1000, 'smoke done')
    } catch {
      // Already closed.
    }
  }
}

async function connect(room, label, playerId, name) {
  const client = new RoomClient({ room, label, playerId, name })
  await client.open()
  OPEN_CLIENTS.add(client)
  return client
}

function sendJoin(client) {
  client.send({ t: 'join', playerId: client.playerId, name: client.name })
}

async function expectError(client, code, step) {
  const event = await client.next((entry) => entry.t === 'error', `${step} (error ${code})`)
  assert(
    event.code === code,
    `${client.context}: ${step} should fail with ${code}, got ${event.code}: ${event.message}`
  )
  return event
}

/** Everyone in the room learns the lobby, whatever join they happened to be at. */
async function awaitLobby(observer, size, step) {
  const state = await observer.next(
    (event) => event.t === 'state' && event.room.players.length === size,
    step
  )
  assert(
    state.room.phase === 'lobby',
    `${observer.context}: ${step} arrived with phase ${state.room.phase} instead of lobby`
  )
  return state.room
}

/** Opens a lobby of `size` clients in join order and starts `mode` on it. */
async function openGame(room, mode, size) {
  const context = `${room}/${mode}`
  const players = []
  for (let index = 0; index < size; index += 1) {
    const client = await connect(room, `${mode}-p${index + 1}`, `smoke-${mode}-${index + 1}`, `${mode} P${index + 1}`)
    players.push(client)
    sendJoin(client)
  }

  const host = players[0]
  const lobby = await awaitLobby(host, size, `${context}: state with ${size} players`)
  assert(
    lobby.hostId === host.playerId,
    `${context}: the first player to join must host, got ${lobby.hostId}`
  )

  host.send({ t: 'start', mode, count: 1 })
  const playing = await host.next(
    (event) => event.t === 'state' && event.room.phase === 'playing',
    `${context}: state entering the playing phase`
  )
  assert(playing.room.mode === mode, `${context}: the room must play ${mode}, got ${playing.room.mode}`)
  assert(
    playing.room.totalRounds === 1,
    `${context}: count 1 must open exactly one round, got ${playing.room.totalRounds}`
  )
  assert(
    playing.room.hostId === host.playerId,
    `${context}: the host keeps hosting once the game starts`
  )

  const round = await host.next((event) => event.t === 'round', `${context}: round event`)
  assert(round.index === 0 && round.total === 1, `${context}: the first round is 0 of 1`)
  return { context, players, host, round }
}

/**
 * The round closed with every field the contract promises.
 *
 * `pointsSum` is recomputed from the outcomes so the caller can compare it with
 * the `finished` payload.
 */
function assertRoundResult(context, result, { family, playerIds, solutionKind }) {
  assert(result.prompt && result.prompt.kind === family, `${context}: the result must carry its ${family} prompt`)
  assert(Array.isArray(result.outcomes), `${context}: the result must carry outcomes`)
  assert(result.outcomes.length > 0, `${context}: the result must carry at least one outcome`)
  for (const outcome of result.outcomes) {
    assert(
      playerIds.includes(outcome.playerId),
      `${context}: outcome for ${outcome.playerId}, who is not in the room`
    )
    assert(typeof outcome.correct === 'boolean', `${context}: an outcome needs a boolean correct`)
    assert(typeof outcome.points === 'number', `${context}: an outcome needs numeric points`)
    assert('detail' in outcome, `${context}: an outcome needs a detail field, even when it is null`)
  }
  if (solutionKind === 'string') {
    assert(
      typeof result.solution === 'string' && result.solution.trim() !== '',
      `${context}: the closed round must carry a readable solution, got ${JSON.stringify(result.solution)}`
    )
  }
  if (result.winnerId !== null) {
    assert(playerIds.includes(result.winnerId), `${context}: the winner ${result.winnerId} is not in the room`)
  }
}

/** The `finished` broadcast, equal on every socket, with scores matching the outcomes. */
async function assertFinished(context, { host, players, result }) {
  const finished = await host.next((event) => event.t === 'finished', `${context}: finished event`)
  const playerIds = players.map((player) => player.playerId)
  assert(Array.isArray(finished.players) && finished.players.length === playerIds.length, `${context}: the finish payload must list every player`)
  assert(
    finished.players.map((player) => player.id).join(',') === playerIds.join(','),
    `${context}: the finish payload must list players in join order, got ${finished.players
      .map((player) => player.id)
      .join(',')}`
  )

  const earned = Object.fromEntries(playerIds.map((id) => [id, 0]))
  for (const outcome of result.outcomes) earned[outcome.playerId] += outcome.points
  for (const id of playerIds) {
    assert(typeof finished.scores[id] === 'number', `${context}: ${id} is missing from the final scores`)
    assert(
      finished.scores[id] === earned[id],
      `${context}: ${id} should end on ${earned[id]} point(s), the sum of its outcomes, got ${finished.scores[id]}`
    )
  }

  const payload = JSON.stringify(finished.scores)
  for (const player of players) {
    if (player === host) continue
    const seen = await player.next(
      (event) => event.t === 'finished',
      `${context}: finished event on ${player.label}`
    )
    assert(
      JSON.stringify(seen.scores) === payload,
      `${context}: ${player.label} got different final scores: ${JSON.stringify(seen.scores)} vs ${payload}`
    )
  }
  return finished
}

/* ------------------------------------------------------------- scenarios */

/** 1. One room, two players, the whole single-round lifecycle. */
async function runLifecycle(room) {
  const mode = 'write-all'
  const family = FAMILY_BY_MODE[mode]
  console.log(`→ ${room} lifecycle (${mode}, 2 players)`)
  const context = `${room}/${mode}`

  const ana = await connect(room, 'ana', 'smoke-ana', 'Ana')
  const beto = await connect(room, 'beto', 'smoke-beto', 'Beto')
  sendJoin(ana)
  sendJoin(beto)

  const lobby = await awaitLobby(ana, 2, `${context}: state with two players`)
  assert(lobby.hostId === 'smoke-ana', `${context}: the first player to join hosts, got ${lobby.hostId}`)
  assert(
    lobby.players.map((player) => player.name).join(',') === 'Ana,Beto',
    `${context}: the lobby must list both players in join order, got ${JSON.stringify(lobby.players)}`
  )
  assert(
    Object.values(lobby.scores).every((score) => score === 0),
    `${context}: every player starts on zero, got ${JSON.stringify(lobby.scores)}`
  )
  assert(lobby.roundIndex === null && lobby.totalRounds === null && lobby.prompt === null, `${context}: the lobby carries no round`)
  console.log('  ✓ two players joined, the first one hosts, nobody is playing yet')

  beto.send({ t: 'start', count: 1 })
  await expectError(beto, 'not_host', `${context}: start by the non-host player`)
  console.log('  ✓ a non-host start is refused with not_host')

  ana.send({ t: 'start', mode, count: 1 })
  const playing = await ana.next(
    (event) => event.t === 'state' && event.room.phase === 'playing',
    `${context}: state entering the playing phase`
  )
  assert(playing.room.mode === mode && playing.room.totalRounds === 1, `${context}: the room must play one round of ${mode}`)

  const round = await ana.next((event) => event.t === 'round', `${context}: round event`)
  assert(round.index === 0 && round.total === 1, `${context}: the round must be 0 of 1`)
  assert(round.prompt.kind === family, `${context}: expected a ${family} prompt, got ${round.prompt.kind}`)
  assertKeys(context, round.prompt, PROMPT_KEYS.tenses, 'the round prompt')
  assert(typeof round.prompt.spanish === 'string' && round.prompt.spanish !== '', `${context}: the prompt needs the Spanish verb`)
  assert(round.prompt.givenTense === null && round.prompt.givenForm === null, `${context}: write-all must reveal no form of the verb`)
  await beto.next((event) => event.t === 'round', `${context}: round event on beto`)
  console.log(`  ✓ round opened for "${round.prompt.spanish}" and both clients got it`)

  const wrongTenses = { kind: 'tenses', answers: { base: 'zzz', past: 'zzz', participle: 'zzz' } }
  ana.send({ t: 'answer', index: 0, reply: wrongTenses })
  const progress = await ana.next(
    (event) => event.t === 'progress' && event.index === 0,
    `${context}: progress with points after the first reply`
  )
  assert(progress.answered.length === 1, `${context}: only one player replied so far`)
  const first = progress.answered[0]
  assert(first.playerId === 'smoke-ana', `${context}: the progress entry must name the player who replied`)
  assert(first.correct === false, `${context}: a wrong reply must be graded as incorrect`)
  assert(first.points === 0, `${context}: a wrong reply must earn 0 points, got ${first.points}`)
  assert(!ana.has((event) => event.t === 'result'), `${context}: the round closed before every player replied`)
  await delay(EARLY_CLOSE_GRACE_MS)
  assert(!ana.has((event) => event.t === 'result'), `${context}: the round closed while one player had not replied`)
  assert(!ana.has((event) => event.t === 'finished'), `${context}: the game finished before the round closed`)
  console.log('  ✓ progress carried points and the wrong reply kept the round open')

  beto.send({ t: 'answer', index: 0, reply: wrongTenses })
  const result = await ana.next((event) => event.t === 'result', `${context}: result event`)
  assert(result.index === 0, `${context}: the result belongs to round 0`)
  assert(result.winnerId === null, `${context}: a round nobody answered correctly has no winner, got ${result.winnerId}`)
  assertRoundResult(context, result, { family, playerIds: ['smoke-ana', 'smoke-beto'], solutionKind: 'string' })
  assert(result.outcomes.length === 2, `${context}: both players replied, so both are in the outcomes`)
  assert(
    result.outcomes.every((outcome) => outcome.correct === false && outcome.points === 0),
    `${context}: both replies were wrong, got ${JSON.stringify(result.outcomes)}`
  )

  const forms = result.solution.split(' / ').map((form) => form.trim())
  assert(forms.length === TENSE_KEYS.length, `${context}: the solution lists the three forms, got ${JSON.stringify(result.solution)}`)
  assertNoLeak(context, 'the write-all prompt', round.prompt, forms.flatMap((form) => form.split('/')))
  console.log(`  ✓ round closed with outcomes, solution "${result.solution}" and no leak`)

  await assertFinished(context, { host: ana, players: [ana, beto], result })
  console.log('  ✓ finished carried the same 0-0 scores to both clients')
}

/** 2. One room, eight players and the lobby rules that come with them. */
async function runRoster(room) {
  const context = `${room}/roster`
  console.log(`→ ${room} roster (write-all lobby, 8 players + 1 rejected)`)
  const players = []

  const host = await connect(room, 'p1', 'smoke-p1', 'Player 1')
  players.push(host)
  sendJoin(host)
  const alone = await awaitLobby(host, 1, `${context}: state with the lone host`)
  assert(alone.hostId === 'smoke-p1', `${context}: a lone player hosts`)
  assert(Object.keys(alone.scores).length === 1, `${context}: the lone host has a score slot`)

  host.send({ t: 'start', count: 1 })
  await expectError(host, 'below_min_players', `${context}: start with fewer than two players`)
  assert(!host.has((event) => event.t === 'round'), `${context}: no round may open with a lone player`)
  console.log('  ✓ a lone host cannot start: below_min_players')

  for (let index = 2; index <= 8; index += 1) {
    const client = await connect(room, `p${index}`, `smoke-p${index}`, `Player ${index}`)
    players.push(client)
    sendJoin(client)
  }

  const full = await awaitLobby(host, 8, `${context}: state with eight players`)
  const joinOrder = players.map((player) => player.playerId)
  assert(
    full.players.map((player) => player.id).join(',') === joinOrder.join(','),
    `${context}: the lobby must list players in join order, got ${full.players.map((player) => player.id).join(',')}`
  )
  assert(full.hostId === 'smoke-p1', `${context}: the first player keeps hosting while it stays, got ${full.hostId}`)
  assert(
    Object.keys(full.scores).length === 8 && Object.values(full.scores).every((score) => score === 0),
    `${context}: the lobby carries a zero score per player, got ${JSON.stringify(full.scores)}`
  )
  console.log('  ✓ eight players joined one room')

  players[1].send({ t: 'start', count: 1 })
  await expectError(players[1], 'not_host', `${context}: start by the second player with eight in the room`)
  assert(!players[1].has((event) => event.t === 'round'), `${context}: a refused start must not open a round`)
  console.log('  ✓ a non-host start is refused with not_host even when the room is full')

  const ninth = await connect(room, 'p9', 'smoke-p9', 'Player 9')
  sendJoin(ninth)
  await expectError(ninth, 'room_full', `${context}: the ninth join`)
  assert(!ninth.has((event) => event.t === 'state'), `${context}: the refused ninth player must never see the room state`)
  ninth.close()
  console.log('  ✓ the ninth join is refused with room_full and sees no room state')

  host.close()
  const handed = await players[1].next(
    (event) => event.t === 'state' && event.room.players.length === 7,
    `${context}: state after the host left the lobby`
  )
  assert(
    handed.room.hostId === 'smoke-p2',
    `${context}: the host role must pass to the next player in join order, got ${handed.room.hostId}`
  )
  assert(
    !handed.room.players.some((player) => player.id === 'smoke-p1'),
    `${context}: the leaving host must leave the lobby`
  )
  assert(!('smoke-p1' in handed.room.scores), `${context}: the leaving host score must be dropped with it`)
  console.log('  ✓ the leaving host handed the room to the next player in join order')

  for (const player of players.slice(1)) player.close()
}

/* --------------------------------------------------------------- modes */

/** The tenses family: write-all reveals nothing, fill-missing reveals one form. */
async function assertTensesPrompt(context, mode, prompt) {
  assert(prompt.kind === 'tenses', `${context}: expected a tenses prompt, got ${prompt.kind}`)
  assertKeys(context, prompt, PROMPT_KEYS.tenses, 'the round prompt')
  assert(typeof prompt.spanish === 'string' && prompt.spanish !== '', `${context}: the prompt needs the Spanish verb`)
  assert(typeof prompt.type === 'string' && typeof prompt.level === 'string', `${context}: the prompt needs type and level`)

  if (mode === 'write-all') {
    assert(prompt.givenTense === null, `${context}: write-all must reveal no tense`)
    assert(prompt.givenForm === null, `${context}: write-all must reveal no form`)
    return
  }

  assert(
    TENSE_KEYS.includes(prompt.givenTense),
    `${context}: fill-missing must reveal one of ${TENSE_KEYS.join('/')}, got ${prompt.givenTense}`
  )
  assert(
    typeof prompt.givenForm === 'string' && prompt.givenForm !== '',
    `${context}: fill-missing must reveal the form of ${prompt.givenTense}`
  )
}

/** The three forms the closed round reveals, in the order the solution lists them. */
function tenseFormsOf(context, solution) {
  const forms = solution.split(' / ').map((form) => form.trim())
  assert(forms.length === TENSE_KEYS.length, `${context}: the solution lists ${TENSE_KEYS.length} forms, got ${JSON.stringify(solution)}`)
  return forms
}

/** Both tenses modes: a wrong reply earns nothing and the round closes honestly. */
async function runTensesRoom(room, mode) {
  const family = FAMILY_BY_MODE[mode]
  const { context, players, host, round } = await openGame(room, mode, 2)
  console.log(`→ ${room} ${mode} (tenses family, 2 players)`)
  await assertTensesPrompt(context, mode, round.prompt)
  console.log(`  ✓ ${mode} opened a tenses prompt for "${round.prompt.spanish}"`)

  players[0].send({
    t: 'answer',
    index: 0,
    reply: { kind: 'tenses', answers: { base: 'zzz', past: 'zzz', participle: 'zzz' } },
  })
  const progress = await host.next(
    (event) => event.t === 'progress' && event.index === 0,
    `${context}: progress with points after the first reply`
  )
  const first = progress.answered[progress.answered.length - 1]
  assert(first.playerId === players[0].playerId, `${context}: the progress entry must name the player who replied`)
  assert(first.correct === false && first.points === 0, `${context}: a wrong reply must earn 0 points, got ${JSON.stringify(first)}`)
  assert(!host.has((event) => event.t === 'result'), `${context}: first-correct must not close on a wrong reply`)
  await delay(EARLY_CLOSE_GRACE_MS)
  assert(!host.has((event) => event.t === 'result'), `${context}: the round closed before every player replied`)

  players[1].send({
    t: 'answer',
    index: 0,
    reply: { kind: 'tenses', answers: { base: 'zzz', past: 'zzz', participle: 'zzz' } },
  })
  const result = await host.next((event) => event.t === 'result', `${context}: result event`)
  assertRoundResult(context, result, {
    family,
    playerIds: players.map((player) => player.playerId),
    solutionKind: 'string',
  })
  assert(result.winnerId === null, `${context}: nobody was right, so there is no winner`)
  assert(result.outcomes.length === 2, `${context}: both players replied`)

  const forms = tenseFormsOf(context, result.solution)
  if (mode === 'write-all') {
    assertNoLeak(context, 'the write-all prompt', round.prompt, forms.flatMap((form) => form.split('/')))
  } else {
    const revealed = TENSE_KEYS.indexOf(round.prompt.givenTense)
    assert(
      normalized(forms[revealed]) === normalized(round.prompt.givenForm),
      `${context}: the revealed ${round.prompt.givenTense} form must match the solution, got ${round.prompt.givenForm} vs ${forms[revealed]}`
    )
    // A verb whose forms are all the same word (`shed / shed / shed`) reveals
    // every form it has by design, so there is nothing left to hide.
    const hidden = forms.filter((form) => normalized(form) !== normalized(forms[revealed]))
    if (hidden.length > 0) {
      assertNoLeak(
        context,
        'the fill-missing prompt',
        round.prompt,
        hidden.flatMap((form) => form.split('/'))
      )
    }
  }
  console.log(`  ✓ round closed with outcomes and solution "${result.solution}"`)

  await assertFinished(context, { host, players, result })
  return { mode, family, clients: 2, rounds: 1, correctReply: 'not provable (verb pool is server-private)' }
}

/** The list family: the count is public, the accepted items are not. */
async function runListRoom(room, mode) {
  const family = FAMILY_BY_MODE[mode]
  const { context, players, host, round } = await openGame(room, mode, 2)
  console.log(`→ ${room} ${mode} (list family, 2 players)`)
  const prompt = round.prompt
  assert(prompt.kind === 'list', `${context}: expected a list prompt, got ${prompt.kind}`)
  assertKeys(context, prompt, PROMPT_KEYS.list, 'the round prompt')
  assert(typeof prompt.word === 'string' && prompt.word !== '', `${context}: the prompt needs the word`)
  assert(typeof prompt.hint === 'string' && prompt.hint !== '', `${context}: the prompt needs a hint`)
  assert(
    Number.isInteger(prompt.expectedCount) && prompt.expectedCount >= 1,
    `${context}: the prompt must carry how many items exist, got ${prompt.expectedCount}`
  )
  console.log(`  ✓ ${mode} opened a list prompt for "${prompt.word}" expecting ${prompt.expectedCount} items`)

  players[0].send({ t: 'answer', index: 0, reply: { kind: 'list', items: ['zzz'] } })
  const progress = await host.next(
    (event) => event.t === 'progress' && event.index === 0,
    `${context}: progress with points after the first reply`
  )
  const first = progress.answered[progress.answered.length - 1]
  assert(first.playerId === players[0].playerId, `${context}: the progress entry must name the player who replied`)
  assert(first.correct === false && first.points === 0, `${context}: an item nobody listed must earn 0 points, got ${JSON.stringify(first)}`)
  assert(!host.has((event) => event.t === 'result'), `${context}: all-answered must wait for the second player`)
  await delay(EARLY_CLOSE_GRACE_MS)
  assert(!host.has((event) => event.t === 'result'), `${context}: the round closed before every player replied`)

  players[1].send({ t: 'answer', index: 0, reply: { kind: 'list', items: ['zzz'] } })
  const result = await host.next((event) => event.t === 'result', `${context}: result event`)
  assertRoundResult(context, result, {
    family,
    playerIds: players.map((player) => player.playerId),
    solutionKind: 'string',
  })
  assert(result.outcomes.length === 2, `${context}: both players replied`)
  for (const outcome of result.outcomes) {
    assert(
      typeof outcome.detail === 'string' && /^\d+\/\d+$/.test(outcome.detail),
      `${context}: a list outcome carries its partial credit as found/expected, got ${JSON.stringify(outcome.detail)}`
    )
  }

  const accepted = result.solution.split(', ').map((item) => item.trim())
  assert(
    accepted.length === prompt.expectedCount,
    `${context}: the solution must list the ${prompt.expectedCount} accepted items the prompt promised, got ${JSON.stringify(result.solution)}`
  )
  assertNoLeak(context, 'the list prompt', prompt, accepted)
  console.log(`  ✓ round closed with a ${accepted.length}-item solution and no leak`)

  await assertFinished(context, { host, players, result })
  return { mode, family, clients: 2, rounds: 1, correctReply: 'not provable (item pool is server-private)' }
}

/** One pick in a choice round: the option ids are opaque, so we play the options. */
async function runChoiceRoom(room, mode, clients) {
  const family = FAMILY_BY_MODE[mode]
  const { context, players, host, round } = await openGame(room, mode, clients)
  console.log(`→ ${room} ${mode} (choice family, ${clients} players)`)
  const prompt = round.prompt
  assert(prompt.kind === 'choice', `${context}: expected a choice prompt, got ${prompt.kind}`)
  assertKeys(context, prompt, PROMPT_KEYS.choice, 'the round prompt')
  assert(typeof prompt.item === 'string' && prompt.item !== '', `${context}: the prompt needs the item`)
  assert(typeof prompt.question === 'string' && prompt.question !== '', `${context}: the prompt needs a question`)
  assert(prompt.hint === null || typeof prompt.hint === 'string', `${context}: the hint is a string or null`)
  assert(Array.isArray(prompt.options) && prompt.options.length === CHOICE_OPTIONS, `${context}: a choice round offers ${CHOICE_OPTIONS} options, got ${prompt.options?.length}`)
  for (const option of prompt.options) {
    assertKeys(context, option, ['id', 'label'], 'an option')
    assert(typeof option.label === 'string' && option.label !== '', `${context}: an option needs a label`)
  }
  const ids = prompt.options.map((option) => option.id)
  const labels = prompt.options.map((option) => normalized(option.label))
  assert(new Set(ids).size === ids.length, `${context}: option ids must be unique, got ${JSON.stringify(ids)}`)
  assert(new Set(labels).size === labels.length, `${context}: option labels must be unique, got ${JSON.stringify(labels)}`)
  console.log(`  ✓ ${mode} opened a choice prompt for "${prompt.item}" with ${CHOICE_OPTIONS} options`)

  // The right option id lives in the round's secret, so the only honest way to a
  // correct reply is to play the options one by one, each from its own player.
  let winner = null
  let closed = null
  for (let index = 0; index < Math.min(clients, CHOICE_OPTIONS); index += 1) {
    players[index].send({ t: 'answer', index: 0, reply: { kind: 'choice', optionId: prompt.options[index].id } })
    const progress = await host.next(
      (event) => event.t === 'progress' && event.index === 0,
      `${context}: progress after the ${index + 1}. reply`
    )
    const entry = progress.answered[progress.answered.length - 1]
    assert(entry.playerId === players[index].playerId, `${context}: the progress entry must name the player who replied`)
    if (entry.correct) {
      assert(entry.points > 0, `${context}: a correct pick must earn points, got ${entry.points}`)
      winner = { player: players[index], entry }
    } else {
      assert(entry.points === 0, `${context}: a wrong pick must earn 0 points, got ${entry.points}`)
    }
    if (host.has((event) => event.t === 'result' && event.index === 0)) {
      closed = true
      if (winner) break
    }
  }

  const result = await host.next((event) => event.t === 'result', `${context}: result event`)
  assertRoundResult(context, result, {
    family,
    playerIds: players.map((player) => player.playerId),
    solutionKind: 'string',
  })

  const matching = prompt.options.filter((option) => normalized(option.label) === normalized(result.solution))
  assert(
    matching.length === 1,
    `${context}: the solution must be exactly one of the options, got ${JSON.stringify(result.solution)} among ${JSON.stringify(labels)}`
  )
  // An option id is positional and opaque, so it must never spell its own label.
  for (const option of prompt.options) {
    assert(
      !normalized(option.id).includes(normalized(option.label)),
      `${context}: option id "${option.id}" spells its own label "${option.label}"`
    )
  }
  if (prompt.hint !== null) {
    assert(
      !normalized(prompt.hint).includes(normalized(result.solution)),
      `${context}: the hint carries the answer "${result.solution}": ${prompt.hint}`
    )
  }

  if (winner) {
    assert(result.winnerId === winner.player.playerId, `${context}: the player whose pick was right must win, got ${result.winnerId}`)
    const outcome = result.outcomes.find((entry) => entry.playerId === winner.player.playerId)
    assert(outcome && outcome.correct === true && outcome.points === winner.entry.points, `${context}: the winner outcome must carry the points it earned`)
    console.log(`  ✓ a correct pick on option ${matching[0].id} earned ${winner.entry.points} point(s) and won the round`)
  } else {
    assert(result.winnerId === null, `${context}: nobody picked the right option, so there is no winner, got ${result.winnerId}`)
    assert(closed, `${context}: the round must close once every player used its one pick`)
    console.log('  ✓ two guesses missed the right option, and the round closed on the last one')
  }

  await assertFinished(context, { host, players, result })
  return {
    mode,
    family,
    clients,
    rounds: 1,
    correctReply: winner ? 'earned' : 'not provable with two of four options',
  }
}

/** 4. The board: turns, refusals and a full chain sweep, with three players. */
async function runBoardRoom(room) {
  const mode = 'card-matching'
  const family = FAMILY_BY_MODE[mode]
  const { context, players, host, round } = await openGame(room, mode, 3)
  console.log(`→ ${room} ${mode} (board family, 3 players)`)

  const prompt = round.prompt
  assert(prompt.kind === 'board', `${context}: expected a board prompt, got ${prompt.kind}`)
  assertKeys(context, prompt, PROMPT_KEYS.board, 'the round prompt')
  assert(Array.isArray(prompt.cards) && prompt.cards.length === BOARD_CARDS, `${context}: a board deals ${BOARD_CARDS} cards, got ${prompt.cards?.length}`)
  for (const card of prompt.cards) {
    assertKeys(context, card, ['id', 'label'], 'a card')
    assert(/^c\d+$/.test(card.id), `${context}: a card id is positional, got ${card.id}`)
    assert(typeof card.label === 'string' && card.label !== '', `${context}: a card needs a label`)
  }
  assert(new Set(prompt.cards.map((card) => card.id)).size === BOARD_CARDS, `${context}: card ids must be unique`)
  assert(
    BOARD_STEPS.includes(prompt.needed),
    `${context}: the board asks for one of ${BOARD_STEPS.join('/')}, got ${prompt.needed}`
  )
  assert(prompt.completedChains === 0 && prompt.totalChains === BOARD_CHAINS, `${context}: a fresh board has 0 of ${BOARD_CHAINS} chains`)
  const playerIds = players.map((player) => player.playerId)
  assertKeys(context, prompt.chainsBy, playerIds, 'chainsBy')
  assert(
    playerIds.includes(prompt.turnPlayerId),
    `${context}: the board named ${prompt.turnPlayerId} on turn, who is not in the room`
  )
  assert(prompt.turnPlayerId === playerIds[0], `${context}: round 0 opens on the first player in join order, got ${prompt.turnPlayerId}`)
  console.log(`  ✓ ${mode} dealt 16 grouped cards, ${BOARD_CHAINS} chains, and named the first player on turn`)

  // Only the player on turn may move: a stray pick is refused and changes nothing.
  const offTurn = players.find((player) => player.playerId !== prompt.turnPlayerId)
  const progressBefore = host.count((event) => event.t === 'progress')
  const stateBefore = host.count((event) => event.t === 'state')
  offTurn.send({ t: 'answer', index: 0, reply: { kind: 'board', cardId: prompt.cards[0].id } })
  await expectError(offTurn, 'not_your_turn', `${context}: a pick from a player who is not on turn`)
  await delay(EARLY_CLOSE_GRACE_MS)
  assert(host.count((event) => event.t === 'progress') === progressBefore, `${context}: a refused pick must record no reply`)
  assert(host.count((event) => event.t === 'state') === stateBefore, `${context}: a refused pick must not move the board`)
  console.log(`  ✓ ${offTurn.label} was refused with not_your_turn and the board did not move`)

  const byPlayer = new Map(players.map((player) => [player.playerId, player]))
  let current = prompt
  let moves = 0
  let wrongTurnHandoff = null
  const refused = new Map()

  while (moves < BOARD_MAX_PICKS) {
    const key = `${current.needed}:${current.completedChains}`
    const known = refused.get(key) ?? new Set()
    const card = current.cards.find((entry) => !known.has(entry.id))
    assert(card, `${context}: every card was refused while the board asked for ${key}`)

    const mover = byPlayer.get(current.turnPlayerId)
    assert(mover, `${context}: the board named ${current.turnPlayerId} on turn, who is not in the room`)
    const step = `${context}: the ${current.needed} pick for chain ${current.completedChains + 1}/${BOARD_CHAINS}`

    mover.send({ t: 'answer', index: 0, reply: { kind: 'board', cardId: card.id } })
    const progress = await host.next((event) => event.t === 'progress' && event.index === 0, `${step} (progress)`)
    const entry = progress.answered[progress.answered.length - 1]
    assert(entry.playerId === mover.playerId, `${step}: the progress entry must name the player who moved`)
    moves += 1

    if (host.has((event) => event.t === 'result' && event.index === 0)) break

    const state = await host.next(
      (event) => event.t === 'state' && event.room.phase === 'playing',
      `${step} (state after the move)`
    )
    const next = state.room.prompt
    assert(next && next.kind === 'board', `${step}: the board must stay public after a move`)
    const index = playerIds.indexOf(mover.playerId)
    const follower = playerIds[(index + 1) % playerIds.length]

    if (entry.correct) {
      assert(entry.points > 0, `${step}: a correct pick must earn points, got ${entry.points}`)
      assert(
        next.turnPlayerId === mover.playerId,
        `${step}: a correct pick keeps the turn on ${mover.playerId}, got ${next.turnPlayerId}`
      )
    } else {
      assert(entry.points === 0, `${step}: a wrong pick must earn 0 points, got ${entry.points}`)
      known.add(card.id)
      refused.set(key, known)
      assert(
        next.turnPlayerId === follower,
        `${step}: a wrong pick must pass the turn to the next player in join order (${follower}), got ${next.turnPlayerId}`
      )
      wrongTurnHandoff ??= { from: mover.playerId, to: next.turnPlayerId }
    }
    current = next
  }

  assert(moves < BOARD_MAX_PICKS, `${context}: the board did not close after ${BOARD_MAX_PICKS} picks`)
  assert(wrongTurnHandoff, `${context}: no wrong pick was observed, so the turn handoff was never proven`)
  console.log(
    `  ✓ a wrong pick passed the turn from ${wrongTurnHandoff.from} to ${wrongTurnHandoff.to} in join order`
  )

  const result = await host.next((event) => event.t === 'result', `${context}: result event`)
  assertRoundResult(context, result, { family, playerIds, solutionKind: 'string' })
  assert(result.prompt && result.prompt.completedChains === BOARD_CHAINS, `${context}: the closed board shows all ${BOARD_CHAINS} chains done`)
  const lines = result.solution.split('\n').filter((line) => line.trim() !== '')
  assert(lines.length === BOARD_CHAINS, `${context}: the solution lists ${BOARD_CHAINS} chains, got ${JSON.stringify(result.solution)}`)
  for (const line of lines) {
    assert(line.includes('→'), `${context}: every solution line names a chain, got ${JSON.stringify(line)}`)
  }
  for (const outcome of result.outcomes) {
    assert(outcome.points === 0 || outcome.correct === true, `${context}: points are only paid for a correct pick`)
  }
  console.log(`  ✓ the board closed after ${moves} picks with outcomes and a ${lines.length}-chain solution`)

  await assertFinished(context, { host, players, result })
  return { mode, family, clients: 3, rounds: 1, correctReply: 'earned' }
}

/* ------------------------------------------------------------------ main */

function printMatrix(rows) {
  const header = ['mode', 'family', 'clients', 'rounds', 'prompt', 'leak', 'correct reply']
  const table = rows.map((row) => [
    row.mode,
    row.family,
    String(row.clients),
    String(row.rounds),
    'ok',
    'ok',
    row.correctReply,
  ])
  const widths = header.map((title, index) =>
    Math.max(title.length, ...table.map((cells) => cells[index].length))
  )
  const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd()
  console.log(line(header))
  for (const cells of table) console.log(line(cells))
}

async function main() {
  let server = null
  const persistRoot = await mkdtemp(join(tmpdir(), 'english-game-room-smoke-'))

  try {
    console.log('• starting wrangler dev for workers/room…')
    server = await startRoomServer(persistRoot)
    console.log(`• room server ready on ${httpUrl}`)

    const rows = []
    await runLifecycle(makeRoomCode())
    rows.push({
      mode: 'write-all (lifecycle)',
      family: FAMILY_BY_MODE['write-all'],
      clients: 2,
      rounds: 1,
      correctReply: 'not provable (verb pool is server-private)',
    })

    await runRoster(makeRoomCode())

    rows.push(await runTensesRoom(makeRoomCode(), 'write-all'))
    rows.push(await runTensesRoom(makeRoomCode(), 'fill-missing'))
    rows.push(await runListRoom(makeRoomCode(), 'synonyms'))
    rows.push(await runListRoom(makeRoomCode(), 'antonyms'))
    rows.push(await runChoiceRoom(makeRoomCode(), 'cognates', 2))
    rows.push(await runChoiceRoom(makeRoomCode(), 'cognates', CHOICE_OPTIONS))
    rows.push(await runChoiceRoom(makeRoomCode(), 'false-cognates', 2))
    rows.push(await runChoiceRoom(makeRoomCode(), 'false-cognates', CHOICE_OPTIONS))
    rows.push(await runBoardRoom(makeRoomCode()))

    const covered = new Set(rows.map((row) => row.mode))
    for (const mode of MODE_ORDER) {
      assert(covered.has(mode), `the run never exercised the ${mode} mode`)
    }

    console.log('')
    printMatrix(rows)
    console.log('')
    console.log('PASS room smoke')
  } finally {
    for (const client of [...OPEN_CLIENTS]) client.close()
    await stopRoomServer(server)
    await rm(persistRoot, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(`✗ FAIL room smoke: ${error.message}`)
  process.exitCode = 1
})
