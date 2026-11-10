#!/usr/bin/env node
/**
 * Runs the two processes multiplayer needs, side by side.
 *
 * `nuxt dev` serves the app (http://localhost:3010) and `wrangler dev` serves
 * the room Durable Object (ws://127.0.0.1:8787). They are separate servers on
 * purpose: the app is SSR on Nuxt, the rooms live in a Worker. Running only
 * `nuxt dev` leaves the client with nothing to connect to, so this script
 * starts both, prefixes their output with the process name, and stops the whole
 * thing on Ctrl-C or as soon as either one exits.
 *
 * Each child is spawned in its own process group (`detached`), so shutting down
 * signals the whole group: `nuxt dev` forks Nitro and `wrangler dev` forks
 * Miniflare, and a signal to the direct child alone would leave those orphans
 * holding ports 3010 and 8787.
 *
 * Usage: `pnpm dev:all` (or `bun run dev:all`).
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUN = process.platform === 'win32' ? 'bun.exe' : 'bun'
const STOP_GRACE_MS = 4000

const TASKS = [
  { name: 'app', script: 'dev' },
  { name: 'room', script: 'dev:room' },
]

const children = new Set()
let stopping = false

function signalGroup(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    // Negative pid: the child's own process group, grandchildren included.
    process.kill(-child.pid, signal)
  } catch {
    // The group is already gone.
  }
}

function stopAll(code) {
  if (stopping) return
  stopping = true

  for (const child of children) signalGroup(child, 'SIGTERM')

  // Escalate once the grace period passes, then leave no handler behind.
  const deadline = setTimeout(() => {
    for (const child of children) signalGroup(child, 'SIGKILL')
    process.exit(code)
  }, STOP_GRACE_MS)
  deadline.unref()

  const waitForExit = () => {
    if (children.size > 0) return
    clearTimeout(deadline)
    process.exit(code)
  }
  for (const child of children) child.once('exit', waitForExit)
  waitForExit()
}

for (const task of TASKS) {
  const child = spawn(BUN, ['run', task.script], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    detached: true,
  })
  children.add(child)

  const tag = `[${task.name}]`
  const forward = (stream, target) => {
    let pending = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) target.write(`${tag} ${line}\n`)
    })
    stream.on('end', () => {
      if (pending) target.write(`${tag} ${pending}\n`)
    })
  }
  forward(child.stdout, process.stdout)
  forward(child.stderr, process.stderr)

  child.on('error', (error) => {
    console.error(`${tag} could not start:`, error)
    children.delete(child)
    stopAll(1)
  })

  // Either server dying invalidates the other one, so the group goes down.
  child.on('exit', (code, signal) => {
    children.delete(child)
    if (stopping) return
    console.error(`${tag} exited (${signal ?? code}) — stopping the other process`)
    stopAll(code && code > 0 ? code : 1)
  })
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => stopAll(0))
}
