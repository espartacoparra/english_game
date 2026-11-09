import type { GameMode, TenseKey, Verb, VerbLevel, VerbType } from '../types/verb'

/**
 * Browser side of the room protocol.
 *
 * This is the mirror of the authoritative machine in `workers/room/src/machine.ts`.
 * Everything here is pure: no Vue, no DOM. The only host dependency is the
 * WebSocket constructor, which stays isolated inside `createWebSocketTransport`.
 */

export const CODE_PATTERN = /^[A-Z0-9]{6}$/
export const CODE_LENGTH = 6
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export type RoomPhase = 'lobby' | 'playing' | 'finished'

export interface RoomPlayerInfo {
  id: string
  name: string
}

/** What a client may see of the current verb. Never the answers. */
export interface RoundHint {
  spanish: string
  type: VerbType
  level: VerbLevel
}

export interface RoundAnswer {
  playerId: string
  correct: boolean
  answers: Record<TenseKey, string>
  at: number
}

export interface PublicRoom {
  code: string
  phase: RoomPhase
  mode: GameMode
  players: RoomPlayerInfo[]
  scores: Record<string, number>
  roundIndex: number | null
  totalRounds: number | null
  hint: RoundHint | null
}

export interface RoundProgressEntry {
  playerId: string
  correct: boolean
}

export interface FinishedPayload {
  scores: Record<string, number>
  players: RoomPlayerInfo[]
}

export type RoomServerEvent =
  | { t: 'state'; room: PublicRoom }
  | { t: 'round'; index: number; total: number; hint: RoundHint }
  | { t: 'progress'; index: number; answered: RoundProgressEntry[] }
  | {
      t: 'result'
      index: number
      winnerId: string | null
      verb: Verb
      answers: RoundAnswer[]
    }
  | ({ t: 'finished' } & FinishedPayload)
  | { t: 'error'; code: string; message: string }

export type StartOptions = {
  mode?: GameMode
  count?: number | 'all'
  type?: VerbType | 'all'
  level?: VerbLevel | 'all'
}

export type RoomClientMessage =
  | { t: 'join'; playerId: string; name: string }
  | ({ t: 'start' } & StartOptions)
  | { t: 'answer'; index: number; answers: Record<TenseKey, string> }

/** Anything that can hand back random bytes. Injectable so codes are testable. */
export type RandomBytes = (target: Uint8Array) => Uint8Array

function secureRandomBytes(target: Uint8Array): Uint8Array {
  const source = (globalThis as { crypto?: Crypto }).crypto
  if (!source || typeof source.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is not available')
  }
  source.getRandomValues(target)
  return target
}

export function normalizeRoomCode(input: string | null | undefined): string {
  return (input ?? '').trim().toUpperCase()
}

export function isValidRoomCode(input: string | null | undefined): boolean {
  return CODE_PATTERN.test(normalizeRoomCode(input))
}

/**
 * Six uppercase alphanumeric characters, matching `CODE_PATTERN`.
 *
 * Uses rejection sampling instead of `byte % alphabet.length` so every
 * character is equally likely (256 is not a multiple of 36).
 */
export function generateRoomCode(random: RandomBytes = secureRandomBytes): string {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length
  let code = ''
  while (code.length < CODE_LENGTH) {
    const bytes = random(new Uint8Array(CODE_LENGTH))
    for (const byte of bytes) {
      if (byte >= limit) continue
      const char = CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length)
      code += char
      if (code.length === CODE_LENGTH) break
    }
  }
  return code
}

/** Stable per-browser player identity. It is generated once and persisted. */
export function generatePlayerId(
  random: RandomBytes = secureRandomBytes,
  now: number = Date.now()
): string {
  const bytes = random(new Uint8Array(8))
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `player-${now.toString(36)}-${hex}`
}

export function joinMessage(playerId: string, name: string): RoomClientMessage {
  return { t: 'join', playerId, name }
}

export function startMessage(options: StartOptions = {}): RoomClientMessage {
  return { t: 'start', ...options }
}

export function answerMessage(
  index: number,
  answers: Record<TenseKey, string>
): RoomClientMessage {
  return { t: 'answer', index, answers: { ...answers } }
}

/** `ws://host/ws?code=ABC123`, tolerating a trailing slash in the base URL. */
export function roomSocketUrl(baseUrl: string, code: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/ws?code=${normalizeRoomCode(code)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isScoreMap(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isNumber)
}

function isPlayerList(value: unknown): value is RoomPlayerInfo[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && isString(entry.id) && isString(entry.name))
  )
}

function isHint(value: unknown): value is RoundHint {
  return (
    isRecord(value) &&
    isString(value.spanish) &&
    isString(value.type) &&
    isString(value.level)
  )
}

function isAnswerMap(value: unknown): value is Record<TenseKey, string> {
  return isRecord(value) && Object.values(value).every(isString)
}

function isAnswerList(value: unknown): value is RoundAnswer[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        isString(entry.playerId) &&
        typeof entry.correct === 'boolean' &&
        isAnswerMap(entry.answers) &&
        isNumber(entry.at)
    )
  )
}

function isVerb(value: unknown): value is Verb {
  return (
    isRecord(value) &&
    isString(value.spanish) &&
    isString(value.base) &&
    isString(value.past) &&
    isString(value.participle) &&
    isString(value.type) &&
    isString(value.level)
  )
}

function isPublicRoom(value: unknown): value is PublicRoom {
  return (
    isRecord(value) &&
    isString(value.code) &&
    isString(value.phase) &&
    isString(value.mode) &&
    isPlayerList(value.players) &&
    isScoreMap(value.scores) &&
    (value.roundIndex === null || isNumber(value.roundIndex)) &&
    (value.totalRounds === null || isNumber(value.totalRounds)) &&
    (value.hint === null || isHint(value.hint))
  )
}

function isProgressList(value: unknown): value is RoundProgressEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => isRecord(entry) && isString(entry.playerId) && typeof entry.correct === 'boolean'
    )
  )
}

function toEvent(value: unknown): RoomServerEvent | null {
  if (!isRecord(value)) return null

  switch (value.t) {
    case 'state':
      return isPublicRoom(value.room) ? { t: 'state', room: value.room } : null
    case 'round':
      return isNumber(value.index) && isNumber(value.total) && isHint(value.hint)
        ? { t: 'round', index: value.index, total: value.total, hint: value.hint }
        : null
    case 'progress':
      return isNumber(value.index) && isProgressList(value.answered)
        ? { t: 'progress', index: value.index, answered: value.answered }
        : null
    case 'result':
      return isNumber(value.index) &&
        (value.winnerId === null || isString(value.winnerId)) &&
        isVerb(value.verb) &&
        isAnswerList(value.answers)
        ? {
            t: 'result',
            index: value.index,
            winnerId: value.winnerId,
            verb: value.verb,
            answers: value.answers,
          }
        : null
    case 'finished':
      return isScoreMap(value.scores) && isPlayerList(value.players)
        ? { t: 'finished', scores: value.scores, players: value.players }
        : null
    case 'error':
      return isString(value.code) && isString(value.message)
        ? { t: 'error', code: value.code, message: value.message }
        : null
    default:
      return null
  }
}

/**
 * Turns one wire message into typed events.
 *
 * The server always sends a JSON array of events and may eventually add new
 * event types, so unknown or malformed entries are dropped instead of throwing.
 * A message that is not valid JSON at all yields no events.
 */
export function parseRoomEvents(payload: unknown): RoomServerEvent[] {
  let raw: unknown = payload

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }

  if (!Array.isArray(raw)) return []

  const events: RoomServerEvent[] = []
  for (const entry of raw) {
    const event = toEvent(entry)
    if (event) events.push(event)
  }
  return events
}

export interface RoomTransport {
  send(message: RoomClientMessage): void
  onMessage(handler: (events: RoomServerEvent[]) => void): void
  onClose(handler: () => void): void
  close(): void
}

/** The minimal socket surface the transport needs, so tests can fake it. */
export interface SocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
}

export type SocketFactory = (url: string) => SocketLike

const OPEN = 1
const CLOSED = 3

/**
 * WebSocket-backed transport.
 *
 * Messages sent before the socket opens are queued and flushed on open, so the
 * page can call `join()` right after `connect()` without racing the handshake.
 */
export function createWebSocketTransport(
  url: string,
  createSocket: SocketFactory = defaultSocketFactory
): RoomTransport {
  const socket = createSocket(url)
  const messageHandlers: ((events: RoomServerEvent[]) => void)[] = []
  const closeHandlers: (() => void)[] = []
  const queue: string[] = []
  let disposed = false

  function flush(): void {
    while (queue.length > 0) {
      const payload = queue.shift()
      if (payload === undefined) return
      socket.send(payload)
    }
  }

  socket.onopen = () => {
    if (disposed) return
    flush()
  }

  socket.onmessage = (event) => {
    if (disposed) return
    const events = parseRoomEvents(event.data)
    for (const handler of messageHandlers) handler(events)
  }

  function notifyClose(): void {
    if (disposed) return
    disposed = true
    queue.length = 0
    for (const handler of closeHandlers) handler()
  }

  socket.onclose = notifyClose

  // Browsers always follow `error` with `close`, but other hosts may not, so
  // also treat an error on an already-closed socket as the end of the link.
  socket.onerror = () => {
    if (socket.readyState === CLOSED) notifyClose()
  }

  return {
    send(message) {
      if (disposed) return
      const payload = JSON.stringify(message)
      if (socket.readyState === OPEN) {
        socket.send(payload)
      } else {
        queue.push(payload)
      }
    },
    onMessage(handler) {
      messageHandlers.push(handler)
    },
    onClose(handler) {
      closeHandlers.push(handler)
    },
    close() {
      if (disposed) return
      disposed = true
      queue.length = 0
      try {
        socket.close(1000, 'client leaving')
      } catch {
        // The socket may already be closed.
      }
    },
  }
}

function defaultSocketFactory(url: string): SocketLike {
  const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket
  if (typeof WebSocketCtor !== 'function') {
    throw new Error('WebSocket is not available in this environment')
  }
  return new WebSocketCtor(url)
}
