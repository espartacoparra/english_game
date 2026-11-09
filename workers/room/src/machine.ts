import { createSession, gradeAnswers, type GameSessionState } from '../../../app/core/game-core'
import { verbs } from '../../../app/data/verbs'
import type { GameMode, TenseKey, Verb, VerbLevel, VerbType } from '../../../app/types/verb'

export const MAX_PLAYERS = 2
export const CODE_PATTERN = /^[A-Z0-9]{6}$/

export interface RoomPlayer {
  id: string
  name: string
  joinedAt: number
}

export interface RoundAnswer {
  playerId: string
  correct: boolean
  answers: Record<TenseKey, string>
  at: number
}

export interface RoomRound {
  index: number
  answers: RoundAnswer[]
  winnerId: string | null
}

export interface RoomState {
  code: string
  phase: 'lobby' | 'playing' | 'finished'
  mode: GameMode
  players: RoomPlayer[]
  session: GameSessionState | null
  scores: Record<string, number>
  round: RoomRound | null
  createdAt: number
}

/** What a client may see of the current verb. Never the answers. */
export interface RoundHint {
  spanish: string
  type: VerbType
  level: VerbLevel
}

export interface PublicRoom {
  code: string
  phase: RoomState['phase']
  mode: GameMode
  players: { id: string; name: string }[]
  scores: Record<string, number>
  roundIndex: number | null
  totalRounds: number | null
  hint: RoundHint | null
}

export type RoomEvent =
  | { t: 'state'; room: PublicRoom }
  | { t: 'round'; index: number; total: number; hint: RoundHint }
  | { t: 'progress'; index: number; answered: { playerId: string; correct: boolean }[] }
  | {
      t: 'result'
      index: number
      winnerId: string | null
      verb: Verb
      answers: RoundAnswer[]
    }
  | { t: 'finished'; scores: Record<string, number>; players: RoomPlayer[] }

export type MachineResult =
  | { ok: true; state: RoomState; events: RoomEvent[] }
  | { ok: false; error: string }

export function createRoom(code: string, now: number): RoomState {
  return {
    code,
    phase: 'lobby',
    mode: 'write-all',
    players: [],
    session: null,
    scores: {},
    round: null,
    createdAt: now,
  }
}

export function hintFor(state: RoomState): RoundHint | null {
  const verb = currentVerb(state)
  if (!verb) return null
  return { spanish: verb.spanish, type: verb.type, level: verb.level }
}

function currentVerb(state: RoomState): Verb | null {
  if (!state.session || !state.round) return null
  return state.session.selectedVerbs[state.round.index] ?? null
}

export function publicRoom(state: RoomState): PublicRoom {
  return {
    code: state.code,
    phase: state.phase,
    mode: state.mode,
    players: state.players.map((p) => ({ id: p.id, name: p.name })),
    scores: { ...state.scores },
    roundIndex: state.round ? state.round.index : null,
    totalRounds: state.session ? state.session.selectedVerbs.length : null,
    hint: state.phase === 'playing' ? hintFor(state) : null,
  }
}

export function joinRoom(
  state: RoomState,
  options: { name: string; playerId: string },
  now: number
): MachineResult {
  const name = options.name.trim().slice(0, 24)
  if (!name) return { ok: false, error: 'invalid_name' }
  if (!options.playerId) return { ok: false, error: 'invalid_player' }

  const existing = state.players.find((p) => p.id === options.playerId)
  if (existing) {
    const next: RoomState = {
      ...state,
      players: state.players.map((p) => (p.id === existing.id ? { ...p, name } : p)),
    }
    return { ok: true, state: next, events: [{ t: 'state', room: publicRoom(next) }] }
  }

  if (state.phase !== 'lobby') return { ok: false, error: 'game_in_progress' }
  if (state.players.length >= MAX_PLAYERS) return { ok: false, error: 'room_full' }

  const player: RoomPlayer = { id: options.playerId, name, joinedAt: now }
  const next: RoomState = {
    ...state,
    players: [...state.players, player],
    scores: { ...state.scores, [player.id]: 0 },
  }
  return { ok: true, state: next, events: [{ t: 'state', room: publicRoom(next) }] }
}

export function startGame(
  state: RoomState,
  options: {
    mode?: GameMode
    count?: number | 'all'
    type?: VerbType | 'all'
    level?: VerbLevel | 'all'
  },
  now: number,
  rng: () => number = Math.random
): MachineResult {
  if (state.phase !== 'lobby') return { ok: false, error: 'already_started' }
  if (state.players.length < MAX_PLAYERS) return { ok: false, error: 'need_two_players' }

  const mode = options.mode ?? 'write-all'
  const session = createSession(
    verbs,
    {
      mode,
      count: options.count ?? 10,
      type: options.type ?? 'all',
      level: options.level ?? 'all',
    },
    now,
    rng
  )

  const scores: Record<string, number> = {}
  for (const player of state.players) scores[player.id] = 0

  const next: RoomState = {
    ...state,
    phase: 'playing',
    mode,
    session,
    scores,
    round: { index: 0, answers: [], winnerId: null },
  }

  return {
    ok: true,
    state: next,
    events: [
      { t: 'state', room: publicRoom(next) },
      { t: 'round', index: 0, total: session.selectedVerbs.length, hint: hintFor(next)! },
    ],
  }
}

export function submitAnswer(
  state: RoomState,
  playerId: string,
  index: number,
  answers: Partial<Record<TenseKey, string>>,
  now: number
): MachineResult {
  if (state.phase !== 'playing' || !state.round || !state.session) {
    return { ok: false, error: 'not_playing' }
  }
  if (!state.players.some((p) => p.id === playerId)) return { ok: false, error: 'not_in_room' }
  if (index !== state.round.index) return { ok: false, error: 'stale_round' }
  if (state.round.answers.some((a) => a.playerId === playerId)) {
    return { ok: false, error: 'already_answered' }
  }

  const verb = state.session.selectedVerbs[state.round.index]
  if (!verb) return { ok: false, error: 'stale_round' }

  const graded = gradeAnswers(verb, answers)
  const answer: RoundAnswer = {
    playerId,
    correct: graded.correct,
    answers: graded.answers,
    at: now,
  }

  const answersSoFar = [...state.round.answers, answer]
  const events: RoomEvent[] = [
    {
      t: 'progress',
      index: state.round.index,
      answered: answersSoFar.map((a) => ({ playerId: a.playerId, correct: a.correct })),
    },
  ]

  const winnerId = graded.correct ? playerId : null
  const everyoneAnswered = answersSoFar.length >= state.players.length

  // The first correct answer closes the round: the Durable Object serializes
  // messages, so arrival order is the race order. If nobody is correct, the
  // round closes once every player has answered.
  if (!graded.correct && !everyoneAnswered) {
    return {
      ok: true,
      state: {
        ...state,
        round: { ...state.round, answers: answersSoFar },
      },
      events,
    }
  }

  const scores = winnerId
    ? { ...state.scores, [winnerId]: (state.scores[winnerId] ?? 0) + 1 }
    : state.scores

  events.push({
    t: 'result',
    index: state.round.index,
    winnerId,
    verb,
    answers: answersSoFar,
  })

  const nextIndex = state.round.index + 1
  if (nextIndex >= state.session.selectedVerbs.length) {
    const next: RoomState = {
      ...state,
      phase: 'finished',
      scores,
      round: { ...state.round, answers: answersSoFar, winnerId },
    }
    events.push({ t: 'finished', scores: { ...scores }, players: next.players })
    return { ok: true, state: next, events }
  }

  const next: RoomState = {
    ...state,
    scores,
    session: { ...state.session, currentIndex: nextIndex },
    round: { index: nextIndex, answers: [], winnerId: null },
  }
  events.push({
    t: 'round',
    index: nextIndex,
    total: state.session.selectedVerbs.length,
    hint: hintFor(next)!,
  })

  return { ok: true, state: next, events }
}
