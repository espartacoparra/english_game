import type { Rng } from '../../../app/core/game-core'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type PublicRoom,
  type RoomClientMessage,
  type RoomMode,
  type RoomPhase,
  type RoomServerEvent,
  type RoundOutcome,
  type RoundProgressEntry,
  type RoundPrompt,
  type RoundReply,
  type StartOptions,
} from '../../../app/core/room-protocol'
import { DEFAULT_MODE, modeSpec, type ModeRound, type ModeSpec } from './modes'
import { roundDeadlineMs } from './modes/spec'

/** The prompt a mode shows: live board state when it has any, else the dealt one. */
function publicPromptOf(spec: ModeSpec | null, round: ModeRound): RoundPrompt {
  return (spec && spec.publicPrompt ? spec.publicPrompt(round) : null) ?? round.prompt
}

/**
 * When a round that opens at `now` stops taking replies.
 *
 * The number itself lives with the families, in `ROUND_DEADLINE_MS`, so timing
 * is one table and no mode branches on its own name.
 */
function openDeadline(spec: ModeSpec, now: number): number {
  return now + roundDeadlineMs(spec.family)
}

export const CODE_PATTERN = /^[A-Z0-9]{6}$/

export interface RoomPlayer {
  id: string
  name: string
  joinedAt: number
}

export interface RoundAnswer {
  playerId: string
  correct: boolean
  points: number
  /** What the player submitted, for the result screen. */
  detail: string | null
  at: number
}

export interface RoomRound {
  index: number
  /** Prompt, readable solution and private grading data for this round. */
  round: ModeRound
  answers: RoundAnswer[]
  winnerId: string | null
  /**
   * Wall-clock time after which the round closes on time, whoever is idle.
   *
   * Server state only: it never reaches a client, because the wire contract has
   * no field for it and a timeout is a normal `result`.
   */
  deadline: number
}

export interface RoomState {
  code: string
  phase: RoomPhase
  mode: RoomMode
  /** First player to join the lobby; only the host may start. */
  hostId: string | null
  players: RoomPlayer[]
  scores: Record<string, number>
  /** Every round of the session, built once when the game starts. */
  rounds: ModeRound[] | null
  round: RoomRound | null
  createdAt: number
}

export type MachineResult =
  | { ok: true; state: RoomState; events: RoomServerEvent[] }
  | { ok: false; error: string }

export function createRoom(code: string, now: number): RoomState {
  return {
    code,
    phase: 'lobby',
    mode: DEFAULT_MODE,
    hostId: null,
    players: [],
    scores: {},
    rounds: null,
    round: null,
    createdAt: now,
  }
}

/** What every client may see of the current round. Never the answers. */
export function promptFor(state: RoomState): RoundPrompt | null {
  if (state.phase !== 'playing' || !state.round) return null
  return publicPromptOf(modeSpec(state.mode), state.round.round)
}

function playerList(state: RoomState): PublicRoom['players'] {
  return state.players.map((player) => ({ id: player.id, name: player.name }))
}

export function publicRoom(state: RoomState): PublicRoom {
  return {
    code: state.code,
    phase: state.phase,
    mode: state.mode,
    hostId: state.hostId,
    players: playerList(state),
    scores: { ...state.scores },
    roundIndex: state.round ? state.round.index : null,
    totalRounds: state.rounds ? state.rounds.length : null,
    prompt: promptFor(state),
  }
}

/**
 * The players an `all-answered` round still waits for.
 *
 * A mode that knows its own roster answers through `activePlayers`, so a player
 * who left mid-round stops being awaited even though the room keeps their slot
 * and their score. A mode without the hook keeps the old rule and waits for the
 * room's players. A hook that answers with nobody is treated the same way, on
 * purpose: a round never waits for an empty set, because that is what would
 * freeze the room for good.
 */
function expectedResponders(state: RoomState, spec: ModeSpec, round: ModeRound): string[] {
  const fromMode = spec.activePlayers?.(round)
  if (fromMode && fromMode.length > 0) return fromMode
  return state.players.map((player) => player.id)
}

export function joinRoom(
  state: RoomState,
  options: { name: string; playerId: string },
  now: number
): MachineResult {
  const name = options.name.trim().slice(0, 24)
  if (!name) return { ok: false, error: 'invalid_name' }
  if (!options.playerId) return { ok: false, error: 'invalid_player' }

  const existing = state.players.find((player) => player.id === options.playerId)
  if (existing) {
    const next: RoomState = {
      ...state,
      players: state.players.map((player) =>
        player.id === existing.id ? { ...player, name } : player
      ),
    }
    return { ok: true, state: next, events: [{ t: 'state', room: publicRoom(next) }] }
  }

  // "The room is closed" stays true after the game ends, so it wins over
  // `room_full`: a stranger is told why they cannot play, not how many slots
  // are left in a room they will never enter.
  if (state.phase !== 'lobby') return { ok: false, error: 'game_in_progress' }
  if (state.players.length >= MAX_PLAYERS) return { ok: false, error: 'room_full' }

  const player: RoomPlayer = { id: options.playerId, name, joinedAt: now }
  const next: RoomState = {
    ...state,
    // The first player in the lobby hosts; the room keeps the same host until
    // the host leaves.
    hostId: state.hostId ?? player.id,
    players: [...state.players, player],
    scores: { ...state.scores, [player.id]: 0 },
  }
  return { ok: true, state: next, events: [{ t: 'state', room: publicRoom(next) }] }
}

/**
 * A socket went away.
 *
 * In the lobby the player leaves the room, and a leaving host hands the room to
 * the next player in join order. Once the game runs the slot stays: dropping a
 * player mid-round would erase their score and change who the round waits for.
 */
export function leaveRoom(state: RoomState, playerId: string): MachineResult {
  const player = state.players.find((entry) => entry.id === playerId)
  if (!player) return { ok: true, state, events: [] }
  if (state.phase !== 'lobby') {
    // A turn-based mode drops the player from its rotation so the round never
    // waits on somebody who left; the slot and the score stay untouched and a
    // mode without a rotation ignores the departure entirely.
    const spec = modeSpec(state.mode)
    const round = state.round
    if (!spec?.playerLeft || !round) return { ok: true, state, events: [] }
    const updated = spec.playerLeft(round.round, playerId)
    if (!updated) return { ok: true, state, events: [] }
    const next: RoomState = { ...state, round: { ...round, round: updated } }
    return { ok: true, state: next, events: [{ t: 'state', room: publicRoom(next) }] }
  }

  const players = state.players.filter((entry) => entry.id !== playerId)
  const scores = { ...state.scores }
  delete scores[playerId]
  const hostId = state.hostId === playerId ? (players[0]?.id ?? null) : state.hostId
  const next: RoomState = { ...state, players, scores, hostId }
  return { ok: true, state: next, events: [{ t: 'state', room: publicRoom(next) }] }
}

export function startGame(
  state: RoomState,
  playerId: string,
  options: StartOptions,
  rng: Rng = Math.random,
  /**
   * Wall-clock time the round opens. Kept last so every existing caller keeps
   * its argument order; the Durable Object always passes the real clock through
   * `handleMessage`, so the default only serves direct callers.
   */
  now: number = Date.now()
): MachineResult {
  if (state.phase !== 'lobby') return { ok: false, error: 'already_started' }
  if (!state.hostId || state.hostId !== playerId) return { ok: false, error: 'not_host' }
  if (state.players.length < MIN_PLAYERS) return { ok: false, error: 'below_min_players' }
  if (state.players.length > MAX_PLAYERS) return { ok: false, error: 'room_full' }

  const mode = options.mode ?? DEFAULT_MODE
  const spec = modeSpec(mode)
  if (!spec) return { ok: false, error: 'unsupported_mode' }

  const rounds = spec.createRounds(
    {
      count: options.count ?? 10,
      type: options.type ?? 'all',
      level: options.level ?? 'all',
      // Join order: the turn order of a turn-based mode.
      players: state.players.map((player) => player.id),
    },
    rng
  )
  // A mode's pool is never empty (it falls back to its whole list), so a
  // session always has at least one round to open.
  const first = rounds[0]
  if (!first) return { ok: false, error: 'no_rounds' }

  const scores: Record<string, number> = {}
  for (const player of state.players) scores[player.id] = 0

  const next: RoomState = {
    ...state,
    phase: 'playing',
    mode,
    scores,
    rounds,
    round: {
      index: 0,
      round: first,
      answers: [],
      winnerId: null,
      deadline: openDeadline(spec, now),
    },
  }

  return {
    ok: true,
    state: next,
    events: [
      { t: 'state', room: publicRoom(next) },
      { t: 'round', index: 0, total: rounds.length, prompt: publicPromptOf(spec, first) },
    ],
  }
}

export function submitAnswer(
  state: RoomState,
  playerId: string,
  index: number,
  reply: RoundReply,
  now: number
): MachineResult {
  if (state.phase !== 'playing' || !state.round || !state.rounds) {
    return { ok: false, error: 'not_playing' }
  }
  if (!state.players.some((player) => player.id === playerId)) {
    return { ok: false, error: 'not_in_room' }
  }
  const round = state.round
  if (index !== round.index) return { ok: false, error: 'stale_round' }

  const spec = modeSpec(state.mode)
  if (!spec) return { ok: false, error: 'unsupported_mode' }
  // An `all-answered` round waits only for the responders its mode names, so a
  // reply from anybody outside that set, such as a player whose socket already
  // left, changes nothing at all: it is ignored instead of refused. The other
  // two close rules always wait for the whole room and never ignore a reply.
  const expected =
    spec.close.kind === 'all-answered' ? expectedResponders(state, spec, round.round) : null
  if (expected && !expected.includes(playerId)) return { ok: true, state, events: [] }
  // One reply per player, except when the mode decides its own ending: there a
  // player replies once per turn, so many replies in a round are expected.
  const manyReplies = spec.close.kind === 'board-complete'
  if (!manyReplies && round.answers.some((answer) => answer.playerId === playerId)) {
    return { ok: false, error: 'already_answered' }
  }
  if (reply?.kind !== spec.family) return { ok: false, error: 'invalid_reply' }

  const graded = spec.grade(round.round, reply, playerId)
  // A refused reply, such as a pick out of turn, changes nothing at all.
  if (graded.rejected) return { ok: false, error: graded.rejected }
  // The mode may keep state between replies: a board advances on every pick.
  const gradedRound: ModeRound =
    graded.nextSecret === undefined ? round.round : { ...round.round, secret: graded.nextSecret }

  const answer: RoundAnswer = {
    playerId,
    correct: graded.correct,
    points: graded.points,
    detail: graded.detail,
    at: now,
  }
  const answersSoFar = [...round.answers, answer]
  // Points land as each reply arrives, so a mode with partial credit does not
  // depend on who happened to close the round.
  const scores: Record<string, number> = {
    ...state.scores,
    [playerId]: (state.scores[playerId] ?? 0) + graded.points,
  }
  const progress: RoundProgressEntry[] = answersSoFar.map((entry) => ({
    playerId: entry.playerId,
    correct: entry.correct,
    points: entry.points,
  }))
  const everyoneAnswered = expected
    ? // Only the expected responders count, and every one of them has to have
      // replied: a departed player's stored answer no longer holds the round.
      expected.every((id) => answersSoFar.some((entry) => entry.playerId === id))
    : answersSoFar.length >= state.players.length
  // The mode declares the race; a round always closes once nobody is left to
  // answer, even when every reply was wrong. A mode with its own ending says
  // when it is over instead.
  const closes = manyReplies
    ? Boolean(graded.closesRound)
    : spec.close.kind === 'first-correct'
      ? graded.correct || everyoneAnswered
      : everyoneAnswered

  if (!closes) {
    const next: RoomState = {
      ...state,
      scores,
      round: { ...round, round: gradedRound, answers: answersSoFar },
    }
    const events: RoomServerEvent[] = [
      { t: 'progress', index: round.index, answered: progress },
    ]
    // A live prompt changed with this reply, so clients need the board again. A
    // race prompt is a fresh object only when the mode never asked for one, so
    // the reference comparison keeps it silent as before.
    if (publicPromptOf(spec, gradedRound) !== publicPromptOf(spec, round.round)) {
      events.push({ t: 'state', room: publicRoom(next) })
    }
    return { ok: true, state: next, events }
  }

  // `winnerId` is the player who closed the round with a correct reply. A round
  // that ran out of players has no winner even if it has correct answers. A
  // mode with its own ending computes the winner itself.
  const winnerId = manyReplies
    ? (graded.closesRound?.winnerId ?? null)
    : graded.correct && spec.close.kind === 'first-correct'
      ? playerId
      : null

  return {
    ok: true,
    ...closeRound(state, spec, round, gradedRound, answersSoFar, scores, winnerId, now),
  }
}

/**
 * Closes the round in play and opens the next one, or finishes the session.
 *
 * Every close comes through here, whether a reply closed the round or it ran
 * out of time, so a timeout is indistinguishable on the wire from a normal
 * close: the same `progress`, `result` and then `round` or `finished`. The
 * caller has already added this round's points to `scores`, and `answersSoFar`
 * holds every reply that counted.
 */
function closeRound(
  state: RoomState,
  spec: ModeSpec,
  round: RoomRound,
  gradedRound: ModeRound,
  answersSoFar: RoundAnswer[],
  scores: Record<string, number>,
  winnerId: string | null,
  now: number
): { state: RoomState; events: RoomServerEvent[] } {
  const progress: RoundProgressEntry[] = answersSoFar.map((entry) => ({
    playerId: entry.playerId,
    correct: entry.correct,
    points: entry.points,
  }))
  const outcomes: RoundOutcome[] = answersSoFar.map((entry) => ({
    playerId: entry.playerId,
    correct: entry.correct,
    points: entry.points,
    detail: entry.detail,
  }))
  const events: RoomServerEvent[] = [
    { t: 'progress', index: round.index, answered: progress },
    {
      t: 'result',
      index: round.index,
      winnerId,
      prompt: publicPromptOf(spec, gradedRound),
      outcomes,
      solution: round.round.answer,
    },
  ]

  const closed: RoomRound = { ...round, round: gradedRound, answers: answersSoFar, winnerId }
  const nextIndex = round.index + 1
  const total = state.rounds?.length ?? 0

  if (nextIndex >= total) {
    const next: RoomState = { ...state, phase: 'finished', scores, round: closed }
    events.push({ t: 'finished', scores: { ...scores }, players: playerList(next) })
    return { state: next, events }
  }

  const nextRound = state.rounds![nextIndex]!
  const next: RoomState = {
    ...state,
    scores,
    round: {
      index: nextIndex,
      round: nextRound,
      answers: [],
      winnerId: null,
      deadline: openDeadline(spec, now),
    },
  }
  events.push({ t: 'round', index: nextIndex, total, prompt: publicPromptOf(spec, nextRound) })

  return { state: next, events }
}

/**
 * The best standing of a round nobody closed: the player who earned the most
 * points in it, or null when nobody scored and when two players tie.
 */
function roundLeader(answers: RoundAnswer[]): string | null {
  const totals = new Map<string, number>()
  for (const answer of answers) {
    totals.set(answer.playerId, (totals.get(answer.playerId) ?? 0) + answer.points)
  }

  let leader: string | null = null
  let best = 0
  let tied = false
  for (const [playerId, points] of totals) {
    if (points > best) {
      leader = playerId
      best = points
      tied = false
    } else if (points === best) {
      tied = true
    }
  }
  return tied ? null : leader
}

/**
 * Closes the round in play when its deadline has passed, and does nothing else.
 *
 * A round only waits for replies, and a player who is thinking, or away, is
 * neither disconnected nor wrong: without a deadline one idle player freezes
 * the room for everybody. The Durable Object alarm calls this, because a
 * `setTimeout` does not survive hibernation.
 *
 * It reuses the close path of a normal reply, so a timeout looks exactly like a
 * close: the same events, the readable solution revealed, and nobody named as
 * the winner unless the round already had a best standing.
 *
 * It is a no-op, with the same state reference and no events, when there is
 * nothing to close: a room that is not playing (a lobby, a finished game), a
 * round that already advanced (its replacement has a deadline in the future)
 * and a deadline that has not passed. That is what makes the alarm idempotent:
 * a second call reads the state the first one persisted.
 */
export function expireRound(state: RoomState, now: number): MachineResult {
  const round = state.round
  if (state.phase !== 'playing' || !round || !state.rounds) {
    return { ok: true, state, events: [] }
  }
  if (now < round.deadline) return { ok: true, state, events: [] }
  const spec = modeSpec(state.mode)
  // A mode the registry dropped cannot be closed; the room keeps waiting rather
  // than ending every round of it on the first alarm.
  if (!spec) return { ok: true, state, events: [] }

  const closed = closeRound(
    state,
    spec,
    round,
    round.round,
    round.answers,
    state.scores,
    roundLeader(round.answers),
    now
  )
  return { ok: true, state: closed.state, events: closed.events }
}

/**
 * Single entry point for the Durable Object: every client message goes through
 * the pure machine here, so `room.ts` only owns sockets and persistence.
 *
 * `playerId` is the identity the socket attached when it joined, or null when
 * the socket has not joined yet.
 */
export function handleMessage(
  state: RoomState,
  playerId: string | null,
  message: RoomClientMessage,
  now: number,
  rng: Rng = Math.random
): MachineResult {
  switch (message.t) {
    case 'join':
      return joinRoom(state, { name: message.name ?? '', playerId: message.playerId ?? '' }, now)
    case 'start':
      if (!playerId) return { ok: false, error: 'join_first' }
      return startGame(state, playerId, message, rng, now)
    case 'answer':
      if (!playerId) return { ok: false, error: 'join_first' }
      return submitAnswer(state, playerId, message.index, message.reply, now)
    default:
      return { ok: false, error: 'unknown_message' }
  }
}
