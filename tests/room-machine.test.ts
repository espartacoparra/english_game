import { describe, expect, it, vi } from 'vitest'
import {
  CODE_PATTERN,
  createRoom,
  expireRound,
  handleMessage,
  joinRoom,
  leaveRoom,
  promptFor,
  publicRoom,
  startGame,
  submitAnswer,
  type MachineResult,
  type RoomState,
} from '../workers/room/src/machine'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  type BoardCard,
  type BoardRoundPrompt,
  type BoardStep,
  type RoomClientMessage,
  type RoomMode,
  type RoomServerEvent,
  type RoundReply,
  type TenseRoundPrompt,
} from '../app/core/room-protocol'
import { TENSE_ORDER } from '../workers/room/src/modes'
import { ROUND_DEADLINE_MS } from '../workers/room/src/modes/spec'
import type { ModeRound, ModeSetup, ModeSpec } from '../workers/room/src/modes/spec'
import { synonyms } from '../workers/room/src/modes/words'
import { filterVerbs } from '../app/core/game-core'
import { verbs } from '../app/data/verbs'
import type { TenseKey, Verb, VerbLevel, VerbType } from '../app/types/verb'

/** Deterministic RNG so the selected verbs can be asserted. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

type TenseReply = Extract<RoundReply, { kind: 'tenses' }>

/** The clock every started room in this file believes in, so deadlines are exact. */
const START = 5000

const P1 = 'p1'
const P2 = 'p2'
const P3 = 'p3'
const P8 = 'p8'
const P9 = 'p9'
const NAMES = ['ana', 'bea', 'cid', 'dee', 'eli', 'fay', 'gus', 'hana', 'ivo']
const WRONG: TenseReply = {
  kind: 'tenses',
  answers: { base: 'zzz', past: 'zzz', participle: 'zzz' },
}

function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `p${index + 1}`)
}

function unwrap(result: MachineResult) {
  if (!result.ok) throw new Error(`unexpected machine error: ${result.error}`)
  return result
}

function ok(result: MachineResult): RoomState {
  return unwrap(result).state
}

function error(result: MachineResult): string {
  if (result.ok) throw new Error('expected an error, but the machine returned a new state')
  return result.error
}

/** Empty room, nobody in it. */
function emptyRoom(): RoomState {
  return createRoom('ABC123', 0)
}

/** Lobby with `count` players, joined in order so `p1` hosts. */
function lobby(count = 2): RoomState {
  let room = emptyRoom()
  for (let index = 0; index < count; index += 1) {
    room = ok(
      joinRoom(room, { name: NAMES[index]!, playerId: `p${index + 1}` }, 1000 + index)
    )
  }
  return room
}

interface StartOverrides {
  count?: number | 'all'
  type?: VerbType | 'all'
  level?: VerbLevel | 'all'
  mode?: RoomMode
}

/** A started room (3 verbs by default) hosted by `p1`. */
function started(
  overrides: StartOverrides = {},
  seed = 1,
  players = 2,
  now = START
): RoomState {
  return ok(startGame(lobby(players), P1, { count: 3, ...overrides }, seeded(seed), now))
}

/** The round's public prompt. The tests never read the private solution. */
function promptOf(state: RoomState): TenseRoundPrompt {
  const prompt = publicRoom(state).prompt
  if (!prompt || prompt.kind !== 'tenses') throw new Error('the room has no tenses prompt')
  return prompt
}

/** The verb behind a prompt, resolved through the public data pool. */
function verbForPrompt(prompt: TenseRoundPrompt): Verb {
  const verb = verbs.find((entry) => entry.spanish === prompt.spanish)
  if (!verb) throw new Error(`unknown verb: ${prompt.spanish}`)
  return verb
}

/** A correct `write-all` reply, built from the prompt and the verb pool. */
function replyAll(state: RoomState): TenseReply {
  const verb = verbForPrompt(promptOf(state))
  return {
    kind: 'tenses',
    answers: { base: verb.base, past: verb.past, participle: verb.participle },
  }
}

/** A correct reply for `fill-missing`: only the forms the round asks for. */
function replyMissing(state: RoomState): TenseReply {
  const prompt = promptOf(state)
  const verb = verbForPrompt(prompt)
  const answers: Partial<Record<TenseKey, string>> = {}
  for (const tense of TENSE_ORDER) {
    if (tense !== prompt.givenTense) answers[tense] = verb[tense]
  }
  return { kind: 'tenses', answers }
}

function distinctForms(verb: Verb): boolean {
  return new Set([verb.base, verb.past, verb.participle]).size === 3
}

/**
 * Every string a payload carries, without its keys.
 *
 * Keys such as `givenForm` can contain a verb form by accident, so a raw
 * `JSON.stringify` comparison would report a leak that is not one.
 */
function publicValues(value: unknown): string {
  const found: string[] = []
  const walk = (entry: unknown): void => {
    if (typeof entry === 'string') found.push(entry)
    else if (Array.isArray(entry)) entry.forEach(walk)
    else if (entry && typeof entry === 'object') Object.values(entry).forEach(walk)
  }
  walk(value)
  return found.join('\u0000')
}

/**
 * The first round whose verb has three different forms.
 *
 * Verbs such as `read/read/read` cannot prove a leak, so the safety tests skip
 * them instead of asserting something weaker.
 */
function distinctRound(room: RoomState): {
  state: RoomState
  prompt: TenseRoundPrompt
  verb: Verb
} {
  let state = room
  for (let guard = 0; guard < 50 && state.phase === 'playing'; guard += 1) {
    const prompt = promptOf(state)
    const verb = verbForPrompt(prompt)
    if (distinctForms(verb)) return { state, prompt, verb }
    state = ok(submitAnswer(state, P1, publicRoom(state).roundIndex!, replyAll(state), 10 + guard))
  }
  throw new Error('no verb with three distinct forms in this session')
}

function resultEvent(events: RoomServerEvent[]): Extract<RoomServerEvent, { t: 'result' }> {
  const found = events.find((event) => event.t === 'result')
  if (!found || found.t !== 'result') throw new Error('no result event emitted')
  return found
}

/** `playerId` answers every remaining round correctly. */
function playToEnd(state: RoomState, playerId = P1): RoomState {
  let room = state
  for (let guard = 0; guard < 100 && room.phase === 'playing'; guard += 1) {
    room = ok(submitAnswer(room, playerId, publicRoom(room).roundIndex!, replyAll(room), 100 + guard))
  }
  return room
}

/* ------------------------------------------------------- card-matching board */

/** The chain order of the board, as `CardMatching.vue` walks it. */
const STEP_ORDER: BoardStep[] = ['spanish', 'base', 'past', 'participle']

/** The four cards of one chain, so the board of a round is sixteen cards. */
const CHAIN_COUNT = 4

/** Started card-matching room: one shared board, alternating turns. */
function boardRoom(overrides: StartOverrides = {}, seed = 1, players = 2, now = START): RoomState {
  return ok(
    startGame(
      lobby(players),
      P1,
      { mode: 'card-matching', count: 1, ...overrides },
      seeded(seed),
      now
    )
  )
}

/** The board prompt every client sees. */
function boardPromptOf(state: RoomState): BoardRoundPrompt {
  const prompt = publicRoom(state).prompt
  if (!prompt || prompt.kind !== 'board') throw new Error('the room has no board prompt')
  return prompt
}

/** Every Spanish label of the public pool, to tell Spanish cards from forms. */
const SPANISH_LABELS = new Set(verbs.map((verb) => verb.spanish))

/** The label a step of a chain shows on its card. */
function formLabel(verb: Verb, step: BoardStep): string {
  return step === 'spanish' ? verb.spanish : verb[step]
}

/**
 * The chains of the current board, read from the Spanish cards exactly as a
 * player reads them: every card is public, the grouping behind them is not.
 */
function boardVerbs(state: RoomState): Verb[] {
  const spanish = boardPromptOf(state).cards.filter((card) => SPANISH_LABELS.has(card.label))
  const found = spanish.map((card) => {
    const verb = verbs.find((entry) => entry.spanish === card.label)
    if (!verb) throw new Error(`unknown verb on the board: ${card.label}`)
    return verb
  })
  if (found.length !== CHAIN_COUNT) {
    throw new Error(`the board shows ${found.length} chains, not ${CHAIN_COUNT}`)
  }
  return found
}

/**
 * A card a player can pick for one step of a chain.
 *
 * Cards carry no step, so a player picks the label: any card showing the form
 * counts, which is what the mode grades.
 */
function cardFor(prompt: BoardRoundPrompt, verb: Verb, step: BoardStep): BoardCard {
  const label = formLabel(verb, step)
  const matches = prompt.cards.filter((card) => card.label === label)
  if (matches.length === 0) throw new Error(`no card shows "${label}"`)
  return matches[0]!
}

/** A card that can never be the one the player on turn has to pick. */
function wrongCard(state: RoomState): BoardCard {
  const prompt = boardPromptOf(state)
  const pick =
    prompt.needed === 'spanish'
      ? // Opening a chain needs a Spanish card, so any English form is wrong.
        prompt.cards.find((card) => !SPANISH_LABELS.has(card.label))
      : // Every other step needs an English form, so a Spanish card is wrong.
        prompt.cards.find((card) => SPANISH_LABELS.has(card.label))
  if (!pick) throw new Error('the board has no wrong card')
  return pick
}

/** The player on turn picks a card. */
function pick(state: RoomState, cardId: string, now = 10): RoomState {
  const reply: RoundReply = { kind: 'board', cardId }
  return ok(submitAnswer(state, boardPromptOf(state).turnPlayerId, publicRoom(state).roundIndex!, reply, now))
}

/** The player on turn picks a card that cannot be right, so the turn passes. */
function passTurn(state: RoomState, now = 10): RoomState {
  return pick(state, wrongCard(state).id, now)
}

/**
 * Picks the rest of a chain, from the step the board asks for to its participle,
 * keeping the turn.
 */
function closeChain(state: RoomState, verb: Verb): RoomState {
  let room = state
  const from = STEP_ORDER.indexOf(boardPromptOf(room).needed)
  for (const step of STEP_ORDER.slice(from)) {
    room = pick(room, cardFor(boardPromptOf(room), verb, step).id)
  }
  return room
}

function resultCount(events: RoomServerEvent[]): number {
  return events.filter((event) => event.t === 'result').length
}

describe('createRoom', () => {
  it('starts in an empty lobby with no host and no rounds', () => {
    const room = createRoom('ABC123', 42)
    expect(room.code).toBe('ABC123')
    expect(room.phase).toBe('lobby')
    expect(room.mode).toBe('write-all')
    expect(room.hostId).toBeNull()
    expect(room.players).toEqual([])
    expect(room.rounds).toBeNull()
    expect(room.scores).toEqual({})
    expect(room.round).toBeNull()
    expect(room.createdAt).toBe(42)
  })

  it('exposes the invariants the Worker entry checks', () => {
    expect(MIN_PLAYERS).toBe(2)
    expect(MAX_PLAYERS).toBe(8)
    expect(CODE_PATTERN.test('ABC123')).toBe(true)
    expect(CODE_PATTERN.test('abc123')).toBe(false)
    expect(CODE_PATTERN.test('AB1')).toBe(false)
  })
})

describe('joinRoom', () => {
  it('adds the first player, makes it host and seeds its score', () => {
    const result = unwrap(joinRoom(emptyRoom(), { name: 'ana', playerId: P1 }, 100))
    expect(result.state.players).toEqual([{ id: P1, name: 'ana', joinedAt: 100 }])
    expect(result.state.hostId).toBe(P1)
    expect(result.state.scores).toEqual({ [P1]: 0 })
    expect(result.events).toEqual([{ t: 'state', room: publicRoom(result.state) }])
  })

  it('accepts players up to eight and keeps the first one as host', () => {
    const full = lobby(MAX_PLAYERS)
    expect(full.players.map((player) => player.id)).toEqual(ids(MAX_PLAYERS))
    expect(full.hostId).toBe(P1)
    expect(full.scores).toEqual(Object.fromEntries(ids(MAX_PLAYERS).map((id) => [id, 0])))
  })

  it('rejects a ninth player with room_full', () => {
    const full = lobby(MAX_PLAYERS)
    expect(joinRoom(full, { name: 'ivo', playerId: P9 }, 300)).toEqual({
      ok: false,
      error: 'room_full',
    })
  })

  it('leaves the room untouched when it rejects a join', () => {
    const full = lobby(MAX_PLAYERS)
    const rejected = joinRoom(full, { name: 'ivo', playerId: P9 }, 300)
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect('state' in rejected).toBe(false)
    expect(full.players).toHaveLength(MAX_PLAYERS)
    expect(full.hostId).toBe(P1)
  })

  it('rejoins with the same id without duplicating the player or resetting the score', () => {
    const before = started()
    const scored = ok(submitAnswer(before, P1, 0, replyAll(before), 20))
    expect(scored.scores[P1]).toBe(1)

    const rejoined = unwrap(joinRoom(scored, { name: 'ana renamed', playerId: P1 }, 30)).state
    expect(rejoined.players.map((player) => player.id)).toEqual([P1, P2])
    expect(rejoined.players[0]!.name).toBe('ana renamed')
    expect(rejoined.players[0]!.joinedAt).toBe(1000)
    expect(rejoined.scores).toEqual({ [P1]: 1, [P2]: 0 })
    expect(rejoined.hostId).toBe(P1)
    expect(rejoined.round).toEqual(scored.round)
  })

  it('trims the name and caps it at 24 characters', () => {
    expect(ok(joinRoom(emptyRoom(), { name: '   ana   ', playerId: P1 }, 1)).players[0]!.name).toBe(
      'ana'
    )
    expect(
      ok(joinRoom(emptyRoom(), { name: 'n'.repeat(40), playerId: P1 }, 1)).players[0]!.name
    ).toBe('n'.repeat(24))
  })

  it('rejects a blank name or a missing player id', () => {
    expect(error(joinRoom(emptyRoom(), { name: '   ', playerId: P1 }, 1))).toBe('invalid_name')
    expect(error(joinRoom(emptyRoom(), { name: 'ana', playerId: '' }, 1))).toBe('invalid_player')
  })

  it('rejects a brand new player once the game started, even with free slots', () => {
    const playing = started()
    expect(playing.players).toHaveLength(2)
    // game_in_progress wins over room_full: "the room is closed" is the truth
    // that stays correct after the game ends.
    expect(error(joinRoom(playing, { name: 'cid', playerId: P3 }, 40))).toBe('game_in_progress')
    expect(error(joinRoom(playToEnd(started()), { name: 'cid', playerId: P3 }, 40))).toBe(
      'game_in_progress'
    )
  })
})

describe('host', () => {
  it('lets only the host start the game', () => {
    const room = lobby(3)
    expect(room.hostId).toBe(P1)
    expect(error(startGame(room, P2, { count: 2 }, seeded(1)))).toBe('not_host')
    expect(error(startGame(room, P9, { count: 2 }, seeded(1)))).toBe('not_host')
    expect(ok(startGame(room, P1, { count: 2 }, seeded(1))).phase).toBe('playing')
  })

  it('moves the host to the next player in join order when the host leaves the lobby', () => {
    const three = lobby(3)
    const afterHost = ok(leaveRoom(three, P1))
    expect(afterHost.hostId).toBe(P2)
    expect(afterHost.players.map((player) => player.id)).toEqual([P2, P3])

    const afterOther = ok(leaveRoom(afterHost, P3))
    expect(afterOther.hostId).toBe(P2)

    const empty = ok(leaveRoom(afterOther, P2))
    expect(empty.hostId).toBeNull()
    expect(empty.players).toEqual([])
  })
})

describe('leaveRoom', () => {
  it('removes a player and its score from the lobby', () => {
    const room = lobby(3)
    const next = ok(leaveRoom(room, P3))
    expect(next.players.map((player) => player.id)).toEqual([P1, P2])
    expect(next.scores).toEqual({ [P1]: 0, [P2]: 0 })
    expect(publicRoom(next).players).toEqual([
      { id: P1, name: 'ana' },
      { id: P2, name: 'bea' },
    ])
  })

  it('keeps the slot once the game started so scores and the round survive', () => {
    const room = started()
    const played = ok(submitAnswer(room, P1, 0, replyAll(room), 20))
    const left = ok(leaveRoom(played, P1))
    expect(left.players.map((player) => player.id)).toEqual([P1, P2])
    expect(left.scores[P1]).toBe(1)
    expect(left.round).toEqual(played.round)
  })

  it('ignores a player who was never in the room', () => {
    const room = lobby()
    const result = unwrap(leaveRoom(room, P9))
    expect(result.state).toBe(room)
    expect(result.events).toEqual([])
  })
})

describe('startGame', () => {
  it('needs at least two players before it can start', () => {
    expect(error(startGame(lobby(1), P1, {}, seeded(1)))).toBe('below_min_players')
    // An empty room has no host at all, so the truthful error is not_host.
    expect(error(startGame(emptyRoom(), P1, {}, seeded(1)))).toBe('not_host')
  })

  it('starts with two players', () => {
    const room = started({ count: 3 })
    expect(room.phase).toBe('playing')
    expect(room.players).toHaveLength(MIN_PLAYERS)
  })

  it('starts with eight players', () => {
    const room = started({ count: 3 }, 1, MAX_PLAYERS)
    expect(room.phase).toBe('playing')
    expect(room.players).toHaveLength(MAX_PLAYERS)
    expect(publicRoom(room).players).toHaveLength(MAX_PLAYERS)
  })

  it('cannot start twice', () => {
    expect(error(startGame(started(), P1, { count: 2 }, seeded(2)))).toBe('already_started')
  })

  it('moves the room to round zero with zeroed scores', () => {
    const result = unwrap(startGame(lobby(), P1, { count: 3 }, seeded(1)))

    expect(result.state.phase).toBe('playing')
    expect(result.state.mode).toBe('write-all')
    expect(result.state.round).toMatchObject({ index: 0, answers: [], winnerId: null })
    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 0 })

    expect(result.events.map((event) => event.t)).toEqual(['state', 'round'])
    expect(result.events[0]).toEqual({ t: 'state', room: publicRoom(result.state) })
    expect(result.events[1]).toEqual({
      t: 'round',
      index: 0,
      total: 3,
      prompt: promptFor(result.state),
    })
    expect(promptOf(result.state).givenTense).toBeNull()
    expect(verbs.some((verb) => verb.spanish === promptOf(result.state).spanish)).toBe(true)
  })

  it('honours start.mode and defaults to write-all', () => {
    expect(started().mode).toBe('write-all')
    expect(publicRoom(started()).mode).toBe('write-all')

    const filling = started({ mode: 'fill-missing' })
    expect(filling.mode).toBe('fill-missing')
    expect(publicRoom(filling).mode).toBe('fill-missing')
    expect(promptOf(filling).givenTense).toBe('base')
    expect(promptOf(started()).givenTense).toBeNull()
  })

  it('plays every mode the contract defines and rejects an unknown one', () => {
    for (const mode of [
      'write-all',
      'fill-missing',
      'card-matching',
      'synonyms',
      'antonyms',
      'cognates',
      'false-cognates',
    ] as RoomMode[]) {
      expect(ok(startGame(lobby(), P1, { mode, count: 2 }, seeded(1))).mode).toBe(mode)
    }
    // An unknown mode from a future client is rejected instead of downgraded.
    const room = lobby()
    expect(error(startGame(room, P1, { mode: 'bingo' as RoomMode, count: 2 }, seeded(1)))).toBe(
      'unsupported_mode'
    )
    expect(room.phase).toBe('lobby')
  })

  it('takes the session length from count', () => {
    expect(started({ count: 5 }, 4).rounds).toHaveLength(5)
    expect(started({ count: 'all' }, 4).rounds).toHaveLength(verbs.length)
    expect(publicRoom(started({ count: 5 })).totalRounds).toBe(5)
  })

  it('filters the rounds by type and level', () => {
    const byType = started({ type: 'irregular' }, 6)
    const irregular = new Set(filterVerbs(verbs, 'irregular', 'all').map((verb) => verb.spanish))
    expect(byType.rounds).toHaveLength(3)
    for (const round of byType.rounds!) {
      const prompt = round.prompt as TenseRoundPrompt
      expect(prompt.type).toBe('irregular')
      expect(irregular.has(prompt.spanish)).toBe(true)
    }

    const byLevel = started({ level: 'A1' }, 6)
    for (const round of byLevel.rounds!) {
      expect((round.prompt as TenseRoundPrompt).level).toBe('A1')
    }

    const combined = started({ type: 'regular', level: 'A2' }, 6)
    for (const round of combined.rounds!) {
      const prompt = round.prompt as TenseRoundPrompt
      expect(prompt.type).toBe('regular')
      expect(prompt.level).toBe('A2')
    }
  })

  it('is deterministic for the same seed', () => {
    const room = lobby()
    const a = ok(startGame(room, P1, { count: 4 }, seeded(11)))
    const b = ok(startGame(room, P1, { count: 4 }, seeded(11)))
    expect(a.rounds!.map((round) => round.prompt)).toEqual(
      b.rounds!.map((round) => round.prompt)
    )
  })
})

describe('submitAnswer', () => {
  it('scores a correct answer, closes the round and emits progress, result and round', () => {
    const room = started()
    const prompt = promptOf(room)
    const verb = verbForPrompt(prompt)
    const solution = [verb.base, verb.past, verb.participle].join(' / ')
    const result = unwrap(submitAnswer(room, P1, 0, replyAll(room), 20))

    expect(result.state.scores).toEqual({ [P1]: 1, [P2]: 0 })
    expect(result.state.round).toMatchObject({ index: 1, answers: [], winnerId: null })
    expect(result.state.phase).toBe('playing')
    expect(result.events.map((event) => event.t)).toEqual(['progress', 'result', 'round'])

    expect(result.events[0]).toEqual({
      t: 'progress',
      index: 0,
      answered: [{ playerId: P1, correct: true, points: 1 }],
    })

    expect(resultEvent(result.events)).toEqual({
      t: 'result',
      index: 0,
      winnerId: P1,
      prompt,
      outcomes: [{ playerId: P1, correct: true, points: 1, detail: solution }],
      solution,
    })

    expect(result.events[2]).toEqual({
      t: 'round',
      index: 1,
      total: 3,
      prompt: promptFor(result.state),
    })
  })

  it('keeps the round open on a wrong answer while others can still answer', () => {
    const result = unwrap(submitAnswer(started(), P1, 0, WRONG, 20))

    expect(result.events).toEqual([
      { t: 'progress', index: 0, answered: [{ playerId: P1, correct: false, points: 0 }] },
    ])
    expect(result.state.round!.index).toBe(0)
    expect(result.state.round!.answers).toHaveLength(1)
    expect(result.state.round!.answers[0]!.detail).toBe('zzz / zzz / zzz')
    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 0 })
    expect(publicRoom(result.state).roundIndex).toBe(0)
  })

  it('lets another player win a round the first one got wrong', () => {
    const before = started()
    const afterP1 = ok(submitAnswer(before, P1, 0, WRONG, 20))
    const result = unwrap(submitAnswer(afterP1, P2, 0, replyAll(afterP1), 30))

    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 1 })
    const closed = resultEvent(result.events)
    expect(closed).toMatchObject({ index: 0, winnerId: P2, prompt: promptOf(before) })
    expect(closed.outcomes.map((outcome) => outcome.playerId)).toEqual([P1, P2])
    expect(result.state.round!.index).toBe(1)
  })

  it('closes the round with no winner when everybody answers wrong', () => {
    const before = started()
    const verb = verbForPrompt(promptOf(before))
    const afterP1 = ok(submitAnswer(before, P1, 0, WRONG, 20))
    const result = unwrap(submitAnswer(afterP1, P2, 0, WRONG, 30))

    expect(result.events.map((event) => event.t)).toEqual(['progress', 'result', 'round'])
    const closed = resultEvent(result.events)
    expect(closed.index).toBe(0)
    expect(closed.winnerId).toBeNull()
    expect(closed.outcomes.map((outcome) => outcome.playerId)).toEqual([P1, P2])
    expect(closed.outcomes.every((outcome) => outcome.correct === false)).toBe(true)
    // The readable solution is revealed only once the round is over.
    expect(closed.solution).toBe([verb.base, verb.past, verb.participle].join(' / '))
    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 0 })
    expect(result.state.round!.index).toBe(1)
    expect(result.state.phase).toBe('playing')
  })

  it('rejects a second answer in the same round', () => {
    const before = started()
    const state = ok(submitAnswer(before, P1, 0, WRONG, 20))
    expect(error(submitAnswer(state, P1, 0, replyAll(before), 30))).toBe('already_answered')
  })

  it('rejects an answer for a round that already advanced', () => {
    const state = started()
    expect(error(submitAnswer(state, P1, 1, replyAll(state), 20))).toBe('stale_round')
    expect(error(submitAnswer(state, P1, -1, WRONG, 20))).toBe('stale_round')
    const advanced = ok(submitAnswer(state, P1, 0, replyAll(state), 20))
    expect(error(submitAnswer(advanced, P2, 0, WRONG, 30))).toBe('stale_round')
  })

  it('rejects a player who is not in the room', () => {
    const state = started()
    expect(error(submitAnswer(state, P9, 0, replyAll(state), 20))).toBe('not_in_room')
  })

  it('rejects answers outside the playing phase', () => {
    expect(error(submitAnswer(lobby(), P1, 0, WRONG, 20))).toBe('not_playing')
    expect(error(submitAnswer(playToEnd(started()), P1, 0, WRONG, 40))).toBe('not_playing')
  })

  it('rejects a reply that belongs to another round family', () => {
    const state = started()
    expect(error(submitAnswer(state, P1, 0, { kind: 'choice', optionId: 'a' }, 20))).toBe(
      'invalid_reply'
    )
    expect(state.round!.answers).toHaveLength(0)
  })
})

describe('finishing the session', () => {
  it('ends the game on the last round and emits the final scores', () => {
    const lastRound = started({ count: 1 }, 3)
    const result = unwrap(submitAnswer(lastRound, P1, 0, replyAll(lastRound), 90))

    expect(result.state.phase).toBe('finished')
    expect(result.events.map((event) => event.t)).toEqual(['progress', 'result', 'finished'])
    expect(result.state.round!.winnerId).toBe(P1)
    expect(result.state.scores).toEqual({ [P1]: 1, [P2]: 0 })
    expect(result.events[2]).toEqual({
      t: 'finished',
      scores: { [P1]: 1, [P2]: 0 },
      players: [
        { id: P1, name: 'ana' },
        { id: P2, name: 'bea' },
      ],
    })

    const room = publicRoom(result.state)
    expect(room.phase).toBe('finished')
    expect(room.prompt).toBeNull()
  })

  it('plays a full session round by round', () => {
    const final = playToEnd(started({ count: 3 }, 5))
    expect(final.phase).toBe('finished')
    expect(final.scores).toEqual({ [P1]: 3, [P2]: 0 })
    expect(final.round!.index).toBe(2)
  })

  it('cannot start a new game once the room finished', () => {
    const final = playToEnd(started({ count: 2 }, 2))
    expect(error(startGame(final, P1, { count: 2 }, seeded(9)))).toBe('already_started')
  })
})

describe('eight players', () => {
  it('closes on the first correct answer and broadcasts one result for everybody', () => {
    const room = started({ count: 2 }, 8, MAX_PLAYERS)
    const result = unwrap(submitAnswer(room, P8, 0, replyAll(room), 20))

    expect(result.events[0]).toEqual({
      t: 'progress',
      index: 0,
      answered: [{ playerId: P8, correct: true, points: 1 }],
    })

    const closed = resultEvent(result.events)
    expect(closed.winnerId).toBe(P8)
    expect(closed.outcomes.map((outcome) => outcome.playerId)).toEqual([P8])
    // One event list goes to every socket: the payload cannot be per player.
    expect(Object.keys(closed).sort()).toEqual([
      'index',
      'outcomes',
      'prompt',
      'solution',
      't',
      'winnerId',
    ])
    expect(result.events.filter((event) => event.t === 'result')).toHaveLength(1)

    expect(result.state.scores[P8]).toBe(1)
    expect(Object.values(result.state.scores).filter((score) => score > 0)).toHaveLength(1)
    expect(result.state.round!.index).toBe(1)
    expect(publicRoom(result.state).players).toHaveLength(MAX_PLAYERS)
  })
})

describe('prompt safety', () => {
  it('never leaks the answers of a write-all round', () => {
    const { state, prompt, verb } = distinctRound(started({ count: 'all' }, 2))

    expect(prompt).toEqual({
      kind: 'tenses',
      spanish: verb.spanish,
      type: verb.type,
      level: verb.level,
      givenTense: null,
      givenForm: null,
    })
    expect(Object.keys(prompt).sort()).toEqual([
      'givenForm',
      'givenTense',
      'kind',
      'level',
      'spanish',
      'type',
    ])

    const visibleRoom = publicValues(publicRoom(state))
    for (const form of [verb.base, verb.past, verb.participle]) {
      expect(visibleRoom).not.toContain(form)
    }

    // A wrong answer keeps the round open, so progress is the only event.
    const index = publicRoom(state).roundIndex!
    const events = unwrap(submitAnswer(state, P1, index, WRONG, 20)).events
    expect(events.map((event) => event.t)).toEqual(['progress'])
    const visibleEvents = publicValues(events)
    for (const form of [verb.base, verb.past, verb.participle]) {
      expect(visibleEvents).not.toContain(form)
    }
  })

  it('describes the lobby without a round', () => {
    expect(publicRoom(lobby())).toEqual({
      code: 'ABC123',
      phase: 'lobby',
      mode: 'write-all',
      hostId: P1,
      players: [
        { id: P1, name: 'ana' },
        { id: P2, name: 'bea' },
      ],
      scores: { [P1]: 0, [P2]: 0 },
      roundIndex: null,
      totalRounds: null,
      prompt: null,
    })
    expect(promptFor(lobby())).toBeNull()
    expect(promptFor(started())).not.toBeNull()
  })

  it('fill-missing reveals only the given form and rotates it every round', () => {
    let room = started({ mode: 'fill-missing', count: 'all' }, 3)
    const covered: TenseKey[] = []

    for (let guard = 0; guard < 60 && room.phase === 'playing'; guard += 1) {
      const index = publicRoom(room).roundIndex!
      const prompt = promptOf(room)
      const verb = verbForPrompt(prompt)
      const given = TENSE_ORDER[index % TENSE_ORDER.length]!

      expect(prompt.givenTense).toBe(given)
      expect(prompt.givenForm).toBe(verb[given])

      if (distinctForms(verb)) {
        covered.push(given)
        // The prompt minus the deliberate reveal leaks no other form.
        const visible = publicValues({ ...prompt, givenForm: null })
        for (const tense of TENSE_ORDER) {
          if (tense === given) continue
          expect(visible).not.toContain(verb[tense])
        }
      }

      room = ok(submitAnswer(room, P1, index, replyMissing(room), 5))
    }

    expect([...new Set(covered)].sort()).toEqual(['base', 'participle', 'past'])
  })

  it('fill-missing grades only the two missing tenses', () => {
    const room = started({ mode: 'fill-missing', count: 'all' }, 5)
    const given = promptOf(room).givenTense!

    // A wrong value in the revealed slot cannot change the grade.
    const reply: TenseReply = {
      kind: 'tenses',
      answers: { ...replyMissing(room).answers, [given]: 'zzz' },
    }
    const result = unwrap(submitAnswer(room, P1, 0, reply, 20))

    expect(result.state.scores[P1]).toBe(1)
    expect(resultEvent(result.events).winnerId).toBe(P1)
    expect(result.state.round!.index).toBe(1)
  })

  it('fill-missing keeps the round open when a missing tense is wrong', () => {
    const room = started({ mode: 'fill-missing', count: 'all' }, 5)
    const prompt = promptOf(room)
    const verb = verbForPrompt(prompt)
    const given = prompt.givenTense!
    const answers: Partial<Record<TenseKey, string>> = { [given]: verb[given] }
    for (const tense of TENSE_ORDER) {
      if (tense !== given) answers[tense] = 'zzz'
    }

    const result = unwrap(submitAnswer(room, P1, 0, { kind: 'tenses', answers }, 20))

    expect(result.events).toEqual([
      { t: 'progress', index: 0, answered: [{ playerId: P1, correct: false, points: 0 }] },
    ])
    expect(publicRoom(result.state).roundIndex).toBe(0)
    expect(result.state.scores[P1]).toBe(0)
  })

  it('fill-missing closes the round for the first correct reply', () => {
    const room = started({ mode: 'fill-missing', count: 3 }, 5)
    const result = unwrap(submitAnswer(room, P2, 0, replyMissing(room), 30))

    expect(resultEvent(result.events).winnerId).toBe(P2)
    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 1 })
    expect(result.state.round!.index).toBe(1)
  })
})

describe('card-matching board', () => {
  it('keeps the turn and advances the chain on a correct pick', () => {
    const room = boardRoom({ count: 2 }, 1)
    const prompt = boardPromptOf(room)
    expect(prompt).toMatchObject({
      kind: 'board',
      needed: 'spanish',
      turnPlayerId: P1,
      completedChains: 0,
      totalChains: CHAIN_COUNT,
      chainsBy: { [P1]: 0, [P2]: 0 },
    })
    // The live board is the prompt the machine hands out, not the dealt one.
    expect(promptFor(room)).toEqual(prompt)
    // The session length comes from `count`; `all` deals one board per four verbs.
    expect(room.rounds).toHaveLength(2)
    expect(boardRoom({ count: 'all' }, 1).rounds).toHaveLength(Math.floor(verbs.length / 4))

    const verb = boardVerbs(room)[0]!
    const card = cardFor(prompt, verb, 'spanish')
    const result = unwrap(
      submitAnswer(room, P1, 0, { kind: 'board', cardId: card.id }, 10)
    )

    const advanced = boardPromptOf(result.state)
    expect(advanced.needed).toBe('base')
    expect(advanced.turnPlayerId).toBe(P1)
    expect(advanced.completedChains).toBe(0)
    expect(result.state.scores).toEqual({ [P1]: 1, [P2]: 0 })
    expect(result.state.round!.index).toBe(0)
    // The prompt changed, so clients get the board back with the progress.
    expect(result.events.map((event) => event.t)).toEqual(['progress', 'state'])
    expect(result.events[1]).toEqual({ t: 'state', room: publicRoom(result.state) })
  })

  it('refuses a pick that is not yours to make', () => {
    const room = boardRoom()
    const card = cardFor(boardPromptOf(room), boardVerbs(room)[0]!, 'spanish')

    expect(error(submitAnswer(room, P2, 0, { kind: 'board', cardId: card.id }, 10))).toBe(
      'not_your_turn'
    )
    // The refused pick leaves no trace at all.
    expect(room.round!.answers).toHaveLength(0)
    expect(room.scores).toEqual({ [P1]: 0, [P2]: 0 })
    expect(boardPromptOf(room).turnPlayerId).toBe(P1)
    expect(boardPromptOf(room).needed).toBe('spanish')
  })

  it('passes the turn and awards nothing on a wrong pick', () => {
    const room = boardRoom()
    const result = unwrap(
      submitAnswer(room, P1, 0, { kind: 'board', cardId: wrongCard(room).id }, 10)
    )

    const passed = boardPromptOf(result.state)
    expect(passed.turnPlayerId).toBe(P2)
    expect(passed.needed).toBe('spanish')
    expect(passed.completedChains).toBe(0)
    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 0 })
    expect(result.events[0]).toEqual({
      t: 'progress',
      index: 0,
      answered: [{ playerId: P1, correct: false, points: 0 }],
    })
    expect(result.events.map((event) => event.t)).toEqual(['progress', 'state'])
  })

  it('credits a completed chain to the player who closed it and moves on', () => {
    let room = boardRoom({ count: 2 }, 1)
    const [first, second] = boardVerbs(room)

    // p1 opens the chain, then wastes the turn: the chain stays in play.
    room = pick(room, cardFor(boardPromptOf(room), first!, 'spanish').id)
    room = passTurn(room)
    expect(boardPromptOf(room).turnPlayerId).toBe(P2)
    expect(boardPromptOf(room).needed).toBe('base')

    // p2 closes the chain p1 opened: the closer takes the credit.
    room = closeChain(room, first!)
    const closed = boardPromptOf(room)
    expect(closed.completedChains).toBe(1)
    expect(closed.chainsBy).toEqual({ [P1]: 0, [P2]: 1 })
    // The board moves to the next chain and the turn stays with the closer.
    expect(closed.needed).toBe('spanish')
    expect(closed.turnPlayerId).toBe(P2)
    // One point for the opening pick, then 1 + 1 + 2 for the closing chain.
    expect(room.scores).toEqual({ [P1]: 1, [P2]: 4 })

    // A closed chain's Spanish card is no longer a valid pick.
    const spent = cardFor(closed, first!, 'spanish')
    const retry = unwrap(submitAnswer(room, P2, 0, { kind: 'board', cardId: spent.id }, 20))
    expect(resultCount(retry.events)).toBe(0)
    expect(boardPromptOf(retry.state).completedChains).toBe(1)
    expect(boardPromptOf(retry.state).turnPlayerId).toBe(P1)

    // The next chain starts on its own Spanish card.
    const next = pick(retry.state, cardFor(boardPromptOf(retry.state), second!, 'spanish').id)
    expect(boardPromptOf(next).needed).toBe('base')
    expect(boardPromptOf(next).completedChains).toBe(1)
    expect(next.round!.index).toBe(0)
  })

  it('closes the round only when all four chains are done and lists the solution', () => {
    let room = boardRoom({ count: 2 }, 4)
    const chains = boardVerbs(room)
    // Two chains each, so the round has no single winner.
    const closers = [P1, P2, P1]

    for (const [index, closer] of closers.entries()) {
      if (boardPromptOf(room).turnPlayerId !== closer) room = passTurn(room)
      expect(boardPromptOf(room).turnPlayerId).toBe(closer)
      room = closeChain(room, chains[index]!)
      expect(room.round!.index).toBe(0)
      expect(room.phase).toBe('playing')
      expect(boardPromptOf(room).completedChains).toBe(index + 1)
    }

    // p2 takes the last chain, so the board ends two chains each.
    if (boardPromptOf(room).turnPlayerId !== P2) room = passTurn(room)
    expect(boardPromptOf(room).turnPlayerId).toBe(P2)
    const last = chains[3]!
    // Three steps of the last chain still keep the round open.
    for (const step of ['spanish', 'base', 'past'] as BoardStep[]) {
      room = pick(room, cardFor(boardPromptOf(room), last, step).id)
    }
    expect(room.round!.index).toBe(0)
    expect(room.phase).toBe('playing')
    expect(boardPromptOf(room).completedChains).toBe(3)

    const result = unwrap(
      submitAnswer(
        room,
        P2,
        0,
        { kind: 'board', cardId: cardFor(boardPromptOf(room), last, 'participle').id },
        99
      )
    )

    const closed = resultEvent(result.events)
    expect(closed.index).toBe(0)
    // p1 closed two chains, p2 the other two.
    expect(closed.winnerId).toBeNull()
    const solution = chains
      .map((verb) => `${verb.spanish} → ${verb.base} / ${verb.past} / ${verb.participle}`)
      .sort()
    // Readable: one line per chain, with the four forms in chain order.
    expect(closed.solution!.split('\n').sort()).toEqual(solution)
    // Every pick of the board is reported, including the ones that kept a turn.
    expect(closed.outcomes.filter((outcome) => outcome.correct)).toHaveLength(CHAIN_COUNT * 4)
    expect(result.events.map((event) => event.t)).toEqual(['progress', 'result', 'round'])

    // The next round is a fresh board and the opening player rotates.
    const fresh = boardPromptOf(result.state)
    expect(result.state.round!.index).toBe(1)
    expect(fresh.completedChains).toBe(0)
    expect(fresh.chainsBy).toEqual({ [P1]: 0, [P2]: 0 })
    expect(fresh.needed).toBe('spanish')
    expect(fresh.turnPlayerId).toBe(P2)
  })

  it('scores every correct step and names the player who closed the most chains', () => {
    let room = boardRoom({ count: 1 }, 6)
    const chains = boardVerbs(room)

    // Correct picks keep the turn, so one player can close the whole board.
    for (const verb of chains) room = closeChain(room, verb)

    expect(room.phase).toBe('finished')
    // Four chains of 1 + 1 + 1 + 2.
    expect(room.scores).toEqual({ [P1]: CHAIN_COUNT * 5, [P2]: 0 })
    expect(room.round!.winnerId).toBe(P1)
  })

  it('rotates the turn in join order over eight players and skips one who left', () => {
    let room = boardRoom({ count: 2 }, 1, MAX_PLAYERS)
    const order: string[] = []
    for (let step = 0; step < MAX_PLAYERS; step += 1) {
      order.push(boardPromptOf(room).turnPlayerId)
      room = passTurn(room, 10 + step)
    }
    expect(order).toEqual(ids(MAX_PLAYERS))
    // A wrong pick from the last player wraps around to the first.
    expect(boardPromptOf(room).turnPlayerId).toBe(P1)

    // p1 and p2 waste their turns so the leaver is the one on turn.
    room = passTurn(room)
    room = passTurn(room)
    expect(boardPromptOf(room).turnPlayerId).toBe(P3)

    const left = unwrap(leaveRoom(room, P3))
    // The slot and the score stay; only the rotation lets the player go.
    expect(left.state.players.map((player) => player.id)).toEqual(ids(MAX_PLAYERS))
    expect(left.events.map((event) => event.t)).toEqual(['state'])
    expect(boardPromptOf(left.state).turnPlayerId).toBe('p4')

    // Leaving while it is not your turn does not take the turn away.
    const alsoLeft = unwrap(leaveRoom(left.state, 'p5'))
    expect(boardPromptOf(alsoLeft.state).turnPlayerId).toBe('p4')

    let rotated = alsoLeft.state
    const seen: string[] = []
    for (let step = 0; step < 4; step += 1) {
      seen.push(boardPromptOf(rotated).turnPlayerId)
      rotated = passTurn(rotated)
    }
    // p3 and p5 are gone from the rotation, nobody else moves.
    expect(seen).toEqual(['p4', 'p6', 'p7', 'p8'])
    expect(boardPromptOf(rotated).turnPlayerId).toBe(P1)
  })

  it('never groups cards by verb or encodes the order in the prompt', () => {
    const room = boardRoom({ count: 1 }, 2)
    const prompt = boardPromptOf(room)

    // No extra field: the grouping has nowhere to travel.
    expect(Object.keys(prompt).sort()).toEqual([
      'cards',
      'chainsBy',
      'completedChains',
      'kind',
      'needed',
      'totalChains',
      'turnPlayerId',
    ])
    expect(prompt.cards).toHaveLength(CHAIN_COUNT * 4)
    // Positional ids: where the card landed says nothing about its content.
    expect(prompt.cards.map((card) => card.id)).toEqual(
      Array.from({ length: CHAIN_COUNT * 4 }, (_, index) => `c${index + 1}`)
    )

    const chains = boardVerbs(room)
    const forms = chains.flatMap((verb) => STEP_ORDER.map((step) => formLabel(verb, step)))
    expect(prompt.cards.map((card) => card.label).sort()).toEqual([...forms].sort())
    for (const card of prompt.cards) {
      expect(Object.keys(card).sort()).toEqual(['id', 'label'])
      for (const form of forms) expect(card.id).not.toContain(form)
    }

    // The board is shuffled: it never arrives in chain order.
    const dealOrder = chains.flatMap((verb) =>
      STEP_ORDER.map((step) => formLabel(verb, step))
    )
    expect(prompt.cards.map((card) => card.label)).not.toEqual(dealOrder)

    // A pick keeps every card on the board: the board is always fully visible.
    const after = pick(room, cardFor(prompt, chains[0]!, 'spanish').id)
    expect(boardPromptOf(after).cards).toEqual(prompt.cards)

    // The deal honours the start filters, like every other mode.
    for (const verb of boardVerbs(boardRoom({ type: 'irregular' }, 3))) {
      expect(verb.type).toBe('irregular')
    }
  })
})

describe('handleMessage', () => {
  it('routes join, start and answer through the machine', () => {
    const joined = unwrap(
      handleMessage(emptyRoom(), null, { t: 'join', playerId: P1, name: 'ana' }, 10)
    )
    expect(joined.state.hostId).toBe(P1)

    const two = unwrap(
      handleMessage(joined.state, P1, { t: 'join', playerId: P2, name: 'bea' }, 11)
    )
    expect(two.state.players).toHaveLength(2)

    const played = unwrap(
      handleMessage(
        two.state,
        P1,
        { t: 'start', count: 3, mode: 'write-all' },
        12,
        seeded(1)
      )
    )
    expect(played.state.phase).toBe('playing')
    expect(played.events.map((event) => event.t)).toEqual(['state', 'round'])

    const answered = unwrap(
      handleMessage(
        played.state,
        P1,
        { t: 'answer', index: 0, reply: replyAll(played.state) },
        13
      )
    )
    expect(answered.state.scores[P1]).toBe(1)
  })

  it('rejects start and answer before the socket joined', () => {
    const room = started()
    expect(error(handleMessage(room, null, { t: 'start' }, 10))).toBe('join_first')
    expect(
      error(handleMessage(room, null, { t: 'answer', index: 0, reply: replyAll(room) }, 10))
    ).toBe('join_first')
  })

  it('rejects a message type the protocol does not define', () => {
    const message = { t: 'nope' } as unknown as RoomClientMessage
    expect(error(handleMessage(lobby(), P1, message, 10))).toBe('unknown_message')
  })
})

/* ------------------------------------------- all-answered rounds and leavers */

/** One synonyms round dealt to a room of `players`, deterministically. */
function wordsRound(players: string[] = [P1, P2, P3]): ModeRound {
  const setup: ModeSetup = { count: 1, type: 'all', level: 'all', players }
  const [round] = synonyms.createRounds(setup, seeded(1))
  if (!round) throw new Error('the synonyms pool dealt no round')
  return round
}

describe('all-answered expectation', () => {
  it('waits for the roster the round was dealt to', () => {
    expect(synonyms.activePlayers!(wordsRound())).toEqual([P1, P2, P3])
  })

  it('stops waiting for a player who left mid-round', () => {
    const round = wordsRound()
    const after = synonyms.playerLeft!(round, P2)
    expect(after).not.toBeNull()
    // The prompt and the solution stay put: only the expectation moves.
    expect(after!.prompt).toEqual(round.prompt)
    expect(after!.answer).toBe(round.answer)
    expect(synonyms.activePlayers!(after!)).toEqual([P1, P3])
    // The round handed in stays as it was: the mode returns a new one.
    expect(synonyms.activePlayers!(round)).toEqual([P1, P2, P3])
  })

  it('keeps the last player expected when everybody else leaves', () => {
    let round = wordsRound()
    for (const playerId of [P1, P2, P3]) {
      round = synonyms.playerLeft!(round, playerId) ?? round
    }
    // A round that waited for nobody would freeze the room for good, so the
    // last player stays expected even after their socket closed.
    expect(synonyms.activePlayers!(round)).toEqual([P3])
  })

  it('leaves a first-correct round alone when a player leaves mid-round', () => {
    const room = started({ count: 2 }, 3, 3)
    const left = unwrap(leaveRoom(room, P3))
    // write-all has no roster of its own, so the departure moves nothing and
    // the race still closes on the first correct reply.
    expect(left.events).toEqual([])
    expect(left.state).toBe(room)

    const closed = unwrap(submitAnswer(left.state, P1, 0, replyAll(left.state), 20))
    expect(resultEvent(closed.events).winnerId).toBe(P1)
  })
})

/**
 * The machine, loaded fresh for every test.
 *
 * The mode resolver used to be stubbed here because `registry.ts` did not list
 * the words modes yet. It lists every mode now, so these tests play the real
 * path end to end and only the module graph is reset between cases.
 */
async function machinePlaying(_mode: RoomMode, _spec: ModeSpec) {
  vi.resetModules()
  return import('../workers/room/src/machine')
}

type StubbedMachine = Awaited<ReturnType<typeof machinePlaying>>

/** A list reply. Wrong on purpose: the close rule is not about being right. */
const MISSING_LIST: RoundReply = { kind: 'list', items: ['zzz'] }

/** A room of `count` players playing `mode`, on round zero. */
function wordsRoom(machine: StubbedMachine, mode: RoomMode, count = 2): RoomState {
  let room = machine.createRoom('ABC123', 0)
  for (let index = 0; index < count; index += 1) {
    room = ok(
      machine.joinRoom(room, { name: NAMES[index]!, playerId: `p${index + 1}` }, 1000 + index)
    )
  }
  return ok(machine.startGame(room, P1, { count: 2, mode }, seeded(3)))
}

describe('all-answered rounds with a leaver', () => {
  it('closes once every present player replied, not once the room is full', async () => {
    const machine = await machinePlaying('synonyms', synonyms)
    const room = wordsRoom(machine, 'synonyms', 3)
    expect(room.players.map((player) => player.id)).toEqual([P1, P2, P3])

    const left = unwrap(machine.leaveRoom(room, P3))
    // The slot and the score stay; only the expectation lets the player go, and
    // the state broadcast carries it without moving the phase or the prompt.
    expect(left.state.players.map((player) => player.id)).toEqual([P1, P2, P3])
    expect(left.events.map((event) => event.t)).toEqual(['state'])
    expect(left.state.phase).toBe('playing')
    expect(publicRoom(left.state).prompt).toEqual(publicRoom(room).prompt)

    // Two present players are left, so the second reply closes the round: the
    // departed slot no longer holds it open.
    const first = unwrap(machine.submitAnswer(left.state, P1, 0, MISSING_LIST, 20))
    expect(first.state.round!.index).toBe(0)
    expect(first.state.round!.answers.map((answer) => answer.playerId)).toEqual([P1])
    expect(first.events.map((event) => event.t)).toEqual(['progress'])

    const second = unwrap(machine.submitAnswer(first.state, P2, 0, MISSING_LIST, 30))
    expect(second.state.round!.index).toBe(1)
    expect(resultEvent(second.events).outcomes.map((outcome) => outcome.playerId)).toEqual([
      P1,
      P2,
    ])
    expect(second.state.players).toHaveLength(3)
  })

  it('ignores a reply from the departed player instead of refusing it', async () => {
    const machine = await machinePlaying('synonyms', synonyms)
    const room = wordsRoom(machine, 'synonyms', 3)
    const left = unwrap(machine.leaveRoom(room, P3))
    const before = JSON.stringify(left.state)

    const late = unwrap(machine.submitAnswer(left.state, P3, 0, MISSING_LIST, 20))
    // Neither counted nor an error: nothing is stored, scored or broadcast.
    expect(late.events).toEqual([])
    expect(late.state).toBe(left.state)
    expect(JSON.stringify(left.state)).toBe(before)
    expect(late.state.round!.answers).toEqual([])
    expect(late.state.scores[P3]).toBe(0)

    // The round is still waiting for the players who are still there.
    const next = unwrap(machine.submitAnswer(late.state, P1, 0, MISSING_LIST, 30))
    expect(next.state.round!.index).toBe(0)
  })

  it('terminates when a mode would wait for nobody', async () => {
    // A hook that answers with nobody would freeze the room forever, so the
    // round falls back to the room's players and still ends on the last reply.
    const machine = await machinePlaying('antonyms', { ...synonyms, mode: 'antonyms', activePlayers: () => [] })
    const room = wordsRoom(machine, 'antonyms', 2)

    const first = unwrap(machine.submitAnswer(room, P1, 0, MISSING_LIST, 20))
    expect(first.state.round!.index).toBe(0)
    const second = unwrap(machine.submitAnswer(first.state, P2, 0, MISSING_LIST, 30))
    expect(second.state.round!.index).toBe(1)
    expect(resultEvent(second.events).outcomes).toHaveLength(2)
  })
})

/* ------------------------------------------------------- round deadline */

/** A board round opened by the player on turn, which keeps the turn and scores. */
function openChain(state: RoomState): { room: RoomState; verb: Verb } {
  const verb = boardVerbs(state)[0]!
  return { room: pick(state, cardFor(boardPromptOf(state), verb, 'spanish').id), verb }
}

describe('round deadline', () => {
  it('arms every family with its own documented deadline and never sends it', () => {
    const typed = started()
    const quiz = started({ mode: 'cognates' })
    const list = started({ mode: 'synonyms' })
    const board = boardRoom()

    expect(typed.round!.deadline).toBe(START + ROUND_DEADLINE_MS.tenses)
    expect(quiz.round!.deadline).toBe(START + ROUND_DEADLINE_MS.choice)
    expect(list.round!.deadline).toBe(START + ROUND_DEADLINE_MS.list)
    expect(board.round!.deadline).toBe(START + ROUND_DEADLINE_MS.board)

    // Typing three forms needs more time than one pick, a list more than a
    // word, and sixteen cards more than any of them.
    expect(ROUND_DEADLINE_MS.choice).toBeLessThan(ROUND_DEADLINE_MS.tenses)
    expect(ROUND_DEADLINE_MS.tenses).toBeLessThan(ROUND_DEADLINE_MS.list)
    expect(ROUND_DEADLINE_MS.list).toBeLessThan(ROUND_DEADLINE_MS.board)

    // The deadline is server state: the frozen wire contract gains nothing.
    expect(Object.keys(publicRoom(typed))).not.toContain('deadline')
  })

  it('closes an expired round with the normal shape and no winner', () => {
    const room = started()
    const prompt = promptOf(room)
    const verb = verbForPrompt(prompt)
    const solution = [verb.base, verb.past, verb.participle].join(' / ')

    // The deadline itself closes the round: waiting one tick longer is not it.
    const result = unwrap(expireRound(room, room.round!.deadline))

    expect(result.events.map((event) => event.t)).toEqual(['progress', 'result', 'round'])
    expect(result.events[0]).toEqual({ t: 'progress', index: 0, answered: [] })
    // Nobody closed it, so nobody is named; the solution is revealed all the
    // same and the payload has exactly the keys of a normal close.
    expect(resultEvent(result.events)).toEqual({
      t: 'result',
      index: 0,
      winnerId: null,
      prompt,
      outcomes: [],
      solution,
    })
    expect(resultEvent(result.events).solution).toBe(solution)
    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 0 })
    expect(result.state.round!.index).toBe(1)
    // The next round gets a whole deadline of its own, counted from the timeout.
    expect(result.state.round!.deadline).toBe(room.round!.deadline + ROUND_DEADLINE_MS.tenses)
    expect(result.events[2]).toEqual({
      t: 'round',
      index: 1,
      total: 3,
      prompt: promptFor(result.state),
    })
  })

  it('names the best standing of the round as the winner', () => {
    const before = boardRoom()
    const { room, verb } = openChain(before)
    expect(room.scores[P1]).toBe(1)

    const closed = resultEvent(unwrap(expireRound(room, room.round!.deadline)).events)
    expect(closed.winnerId).toBe(P1)
    expect(closed.outcomes).toEqual([
      { playerId: P1, correct: true, points: 1, detail: verb.spanish },
    ])
  })

  it('leaves the round alone, state and all, before the deadline', () => {
    const room = started()
    const early = unwrap(expireRound(room, room.round!.deadline - 1))
    expect(early.events).toEqual([])
    expect(early.state).toBe(room)
  })

  it('ignores a late expiry once a reply already closed the round', () => {
    const room = started()
    const closed = ok(submitAnswer(room, P1, 0, replyAll(room), room.round!.deadline - 1))
    expect(closed.round!.index).toBe(1)

    const late = unwrap(expireRound(closed, room.round!.deadline))
    expect(late.events).toEqual([])
    expect(late.state).toBe(closed)
    expect(late.state.scores).toEqual({ [P1]: 1, [P2]: 0 })
  })

  it('is a no-op in a lobby, on a finished game and on a second run', () => {
    const lobbyRoom = lobby()
    const lobbyExpiry = unwrap(expireRound(lobbyRoom, 10 ** 9))
    expect(lobbyExpiry.events).toEqual([])
    expect(lobbyExpiry.state).toBe(lobbyRoom)

    const finished = playToEnd(started({ count: 2 }, 5))
    expect(finished.phase).toBe('finished')
    const finishedExpiry = unwrap(expireRound(finished, 10 ** 9))
    expect(finishedExpiry.events).toEqual([])
    expect(finishedExpiry.state).toBe(finished)

    // The alarm fires again for the round its first run already closed.
    const room = started()
    const once = unwrap(expireRound(room, room.round!.deadline))
    const twice = unwrap(expireRound(once.state, room.round!.deadline))
    expect(twice.events).toEqual([])
    expect(twice.state).toBe(once.state)
  })

  it('finishes the session when the last round expires', () => {
    const room = started({ count: 1 }, 3)
    const result = unwrap(expireRound(room, room.round!.deadline))

    expect(result.state.phase).toBe('finished')
    expect(result.events.map((event) => event.t)).toEqual(['progress', 'result', 'finished'])
    expect(result.events[2]).toEqual({
      t: 'finished',
      scores: { [P1]: 0, [P2]: 0 },
      players: [
        { id: P1, name: 'ana' },
        { id: P2, name: 'bea' },
      ],
    })
  })

  it('counts the next deadline from the reply clock, not from the session start', () => {
    const room = started()
    const closed = unwrap(submitAnswer(room, P1, 0, replyAll(room), 9000))

    // The normal close still names the player who closed it, and the round it
    // opens is timed from this reply.
    expect(resultEvent(closed.events).winnerId).toBe(P1)
    expect(closed.state.round!.deadline).toBe(9000 + ROUND_DEADLINE_MS.tenses)
  })
})
