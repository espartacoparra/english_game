import type { TenseKey } from '../types/verb'
import type {
  BoardCard,
  BoardRoundPrompt,
  BoardStep,
  ChoiceOption,
  ChoiceRoundPrompt,
  ListRoundPrompt,
  PublicRoom,
  RoomClientMessage,
  RoomMode,
  RoomPhase,
  RoomPlayerInfo,
  RoomServerEvent,
  RoundOutcome,
  RoundProgressEntry,
  RoundPrompt,
  RoundReply,
  StartOptions,
  TenseRoundPrompt,
} from './room-protocol'

/**
 * Browser side of the room protocol.
 *
 * The wire contract itself lives in `app/core/room-protocol.ts`, shared with the
 * authoritative machine in `workers/room/src/machine.ts`. This module re-exports
 * it and adds the browser-only pieces: room codes, client messages, the parser
 * and the transport.
 *
 * Everything here is pure: no Vue, no DOM. The only host dependency is the
 * WebSocket constructor, which stays isolated inside `createWebSocketTransport`.
 */

export { MAX_PLAYERS, MIN_PLAYERS } from './room-protocol'

export type {
  BoardCard,
  BoardRoundPrompt,
  BoardStep,
  ChoiceOption,
  ChoiceRoundPrompt,
  FinishedPayload,
  ListRoundPrompt,
  PublicRoom,
  RoomClientMessage,
  RoomMode,
  RoomPhase,
  RoomPlayerInfo,
  RoomServerEvent,
  RoundFamily,
  RoundOutcome,
  RoundProgressEntry,
  RoundPrompt,
  RoundReply,
  StartOptions,
  TenseRoundPrompt,
} from './room-protocol'

export const CODE_PATTERN = /^[A-Z0-9]{6}$/
export const CODE_LENGTH = 6
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

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

/** Copy of a reply, so a later mutation in the caller cannot rewrite history. */
function cloneReply(reply: RoundReply): RoundReply {
  switch (reply.kind) {
    case 'tenses':
      return { kind: 'tenses', answers: { ...reply.answers } }
    case 'choice':
      return { kind: 'choice', optionId: reply.optionId }
    case 'list':
      return { kind: 'list', items: [...reply.items] }
    case 'board':
      return { kind: 'board', cardId: reply.cardId }
  }
}

/**
 * Builds the `answer` frame, or `null` when the reply does not match the
 * contract. The null case is a client bug, never user input, so callers can
 * surface it without risking an invalid frame on the wire.
 */
export function answerMessage(index: number, reply: RoundReply): RoomClientMessage | null {
  if (!isNumber(index) || !isRoundReply(reply)) return null
  return { t: 'answer', index, reply: cloneReply(reply) }
}

/** `ws://host/ws?code=ABC123`, tolerating a trailing slash in the base URL. */
export function roomSocketUrl(baseUrl: string, code: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/ws?code=${normalizeRoomCode(code)}`
}

/* -------------------------------------------------------------- validation */

const ROOM_PHASES: readonly RoomPhase[] = ['lobby', 'playing', 'finished']
const ROOM_MODES: readonly RoomMode[] = [
  'write-all',
  'fill-missing',
  'card-matching',
  'synonyms',
  'antonyms',
  'cognates',
  'false-cognates',
]
const TENSE_KEYS: readonly TenseKey[] = ['base', 'past', 'participle']
const BOARD_STEPS: readonly BoardStep[] = ['spanish', 'base', 'past', 'participle']
const VERB_TYPES = ['regular', 'irregular'] as const
const VERB_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isMember<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return isString(value) && (allowed as readonly string[]).includes(value)
}

function isPlayerList(value: unknown): value is RoomPlayerInfo[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && isString(entry.id) && isString(entry.name))
  )
}

function isScoreMap(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isNumber)
}

function isTenseAnswers(value: unknown): value is Partial<Record<TenseKey, string>> {
  return (
    isRecord(value) &&
    Object.entries(value).every(([key, entry]) => isMember(TENSE_KEYS, key) && isString(entry))
  )
}

function isChoiceOptions(value: unknown): value is ChoiceOption[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && isString(entry.id) && isString(entry.label))
  )
}

function isBoardCards(value: unknown): value is BoardCard[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && isString(entry.id) && isString(entry.label))
  )
}

/* ---------------------------------------------------------------- prompts */

function isTensePrompt(value: unknown): value is TenseRoundPrompt {
  return (
    isRecord(value) &&
    value.kind === 'tenses' &&
    isString(value.spanish) &&
    isMember(VERB_TYPES, value.type) &&
    isMember(VERB_LEVELS, value.level) &&
    (value.givenTense === null || isMember(TENSE_KEYS, value.givenTense)) &&
    (value.givenForm === null || isString(value.givenForm))
  )
}

function isChoicePrompt(value: unknown): value is ChoiceRoundPrompt {
  return (
    isRecord(value) &&
    value.kind === 'choice' &&
    isString(value.item) &&
    isString(value.question) &&
    (value.hint === null || isString(value.hint)) &&
    isChoiceOptions(value.options)
  )
}

function isListPrompt(value: unknown): value is ListRoundPrompt {
  return (
    isRecord(value) &&
    value.kind === 'list' &&
    isString(value.word) &&
    isString(value.hint) &&
    isNumber(value.expectedCount)
  )
}

function isBoardPrompt(value: unknown): value is BoardRoundPrompt {
  return (
    isRecord(value) &&
    value.kind === 'board' &&
    isBoardCards(value.cards) &&
    isMember(BOARD_STEPS, value.needed) &&
    isString(value.turnPlayerId) &&
    isNumber(value.completedChains) &&
    isNumber(value.totalChains) &&
    isScoreMap(value.chainsBy)
  )
}

/** Unknown prompt families are rejected, never coerced into a known one. */
export function isRoundPrompt(value: unknown): value is RoundPrompt {
  if (!isRecord(value)) return false
  switch (value.kind) {
    case 'tenses':
      return isTensePrompt(value)
    case 'choice':
      return isChoicePrompt(value)
    case 'list':
      return isListPrompt(value)
    case 'board':
      return isBoardPrompt(value)
    default:
      return false
  }
}

/* ---------------------------------------------------------------- replies */

/** Unknown reply kinds are rejected, never coerced into a known one. */
export function isRoundReply(value: unknown): value is RoundReply {
  if (!isRecord(value)) return false
  switch (value.kind) {
    case 'tenses':
      return isTenseAnswers(value.answers)
    case 'choice':
      return isNonEmptyString(value.optionId)
    case 'list':
      return Array.isArray(value.items) && value.items.every(isString)
    case 'board':
      return isNonEmptyString(value.cardId)
    default:
      return false
  }
}

/* ----------------------------------------------------------------- events */

function isPublicRoom(value: unknown): value is PublicRoom {
  return (
    isRecord(value) &&
    isString(value.code) &&
    isMember(ROOM_PHASES, value.phase) &&
    isMember(ROOM_MODES, value.mode) &&
    (value.hostId === null || isString(value.hostId)) &&
    isPlayerList(value.players) &&
    isScoreMap(value.scores) &&
    (value.roundIndex === null || isNumber(value.roundIndex)) &&
    (value.totalRounds === null || isNumber(value.totalRounds)) &&
    (value.prompt === null || isRoundPrompt(value.prompt))
  )
}

function isProgressList(value: unknown): value is RoundProgressEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        isString(entry.playerId) &&
        typeof entry.correct === 'boolean' &&
        isNumber(entry.points)
    )
  )
}

function isOutcomeList(value: unknown): value is RoundOutcome[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        isString(entry.playerId) &&
        typeof entry.correct === 'boolean' &&
        isNumber(entry.points) &&
        (entry.detail === null || isString(entry.detail))
    )
  )
}

function toEvent(value: unknown): RoomServerEvent | null {
  if (!isRecord(value)) return null

  switch (value.t) {
    case 'state':
      return isPublicRoom(value.room) ? { t: 'state', room: value.room } : null
    case 'round':
      return isNumber(value.index) && isNumber(value.total) && isRoundPrompt(value.prompt)
        ? { t: 'round', index: value.index, total: value.total, prompt: value.prompt }
        : null
    case 'progress':
      return isNumber(value.index) && isProgressList(value.answered)
        ? { t: 'progress', index: value.index, answered: value.answered }
        : null
    case 'result':
      return isNumber(value.index) &&
        (value.winnerId === null || isString(value.winnerId)) &&
        isRoundPrompt(value.prompt) &&
        isOutcomeList(value.outcomes) &&
        (value.solution === null || isString(value.solution))
        ? {
            t: 'result',
            index: value.index,
            winnerId: value.winnerId,
            prompt: value.prompt,
            outcomes: value.outcomes,
            solution: value.solution,
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
 * A message that is not valid JSON at all yields no events. A guard that throws
 * on hostile input (a proxy, a getter) drops only its own entry.
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
    try {
      const event = toEvent(entry)
      if (event) events.push(event)
    } catch {
      // A hostile object must not take the whole frame down.
    }
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
