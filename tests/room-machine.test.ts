import { describe, expect, it } from 'vitest'
import {
  CODE_PATTERN,
  MAX_PLAYERS,
  createRoom,
  hintFor,
  joinRoom,
  publicRoom,
  startGame,
  submitAnswer,
  type MachineResult,
  type RoomEvent,
  type RoomState,
} from '../workers/room/src/machine'
import { filterVerbs } from '../app/core/game-core'
import { verbs } from '../app/data/verbs'
import type { VerbLevel, VerbType } from '../app/types/verb'

/** Deterministic RNG so the selected verbs can be asserted. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const P1 = 'p1'
const P2 = 'p2'
const P3 = 'p3'

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

function join(state: RoomState, playerId: string, name: string, now = 1000): RoomState {
  return ok(joinRoom(state, { name, playerId }, now))
}

/** Empty room, nobody in it. */
function emptyRoom(): RoomState {
  return createRoom('ABC123', 0)
}

/** Lobby with one player. */
function solo(): RoomState {
  return join(emptyRoom(), P1, 'ana')
}

/** Lobby with both players. */
function lobby(): RoomState {
  return join(solo(), P2, 'bea', 1001)
}

interface StartOverrides {
  count?: number | 'all'
  type?: VerbType | 'all'
  level?: VerbLevel | 'all'
  mode?: RoomState['mode']
}

/** A started two-player room (3 verbs by default). */
function started(overrides: StartOverrides = {}, seed = 1): RoomState {
  const options = { count: 3, ...overrides }
  return ok(startGame(lobby(), options, 10, seeded(seed)))
}

function verbAt(state: RoomState, index: number) {
  const verb = state.session?.selectedVerbs[index]
  if (!verb) throw new Error(`no verb at index ${index}`)
  return verb
}

function correctFor(state: RoomState, index = state.round?.index ?? 0) {
  const verb = verbAt(state, index)
  return { base: verb.base, past: verb.past, participle: verb.participle }
}

const WRONG = { base: 'zzz', past: 'zzz', participle: 'zzz' }

function resultEvent(events: RoomEvent[]): Extract<RoomEvent, { t: 'result' }> {
  const found = events.find((e) => e.t === 'result')
  if (!found || found.t !== 'result') throw new Error('no result event emitted')
  return found
}

/** P1 answers every remaining round correctly. */
function playToEnd(state: RoomState): RoomState {
  let room = state
  for (let guard = 0; guard < 100 && room.phase === 'playing'; guard += 1) {
    room = ok(submitAnswer(room, P1, room.round!.index, correctFor(room), 100 + guard))
  }
  return room
}

describe('createRoom', () => {
  it('starts in an empty lobby with no session', () => {
    const room = createRoom('ABC123', 42)
    expect(room.code).toBe('ABC123')
    expect(room.phase).toBe('lobby')
    expect(room.mode).toBe('write-all')
    expect(room.players).toEqual([])
    expect(room.session).toBeNull()
    expect(room.scores).toEqual({})
    expect(room.round).toBeNull()
    expect(room.createdAt).toBe(42)
  })

  it('exposes the invariants the Worker entry checks', () => {
    expect(MAX_PLAYERS).toBe(2)
    expect(CODE_PATTERN.test('ABC123')).toBe(true)
    expect(CODE_PATTERN.test('abc123')).toBe(false)
    expect(CODE_PATTERN.test('AB1')).toBe(false)
  })
})

describe('joinRoom', () => {
  it('adds the first player and seeds its score', () => {
    const result = unwrap(joinRoom(emptyRoom(), { name: 'ana', playerId: P1 }, 100))
    expect(result.state.players).toEqual([{ id: P1, name: 'ana', joinedAt: 100 }])
    expect(result.state.scores).toEqual({ [P1]: 0 })
    expect(result.events).toEqual([{ t: 'state', room: publicRoom(result.state) }])
  })

  it('accepts a second player', () => {
    const two = lobby()
    expect(two.players.map((p) => p.id)).toEqual([P1, P2])
    expect(two.players).toHaveLength(MAX_PLAYERS)
    expect(two.scores).toEqual({ [P1]: 0, [P2]: 0 })
  })

  it('rejects a third player with room_full', () => {
    const two = lobby()
    expect(joinRoom(two, { name: 'cid', playerId: P3 }, 300)).toEqual({ ok: false, error: 'room_full' })
  })

  it('leaves the room untouched when it rejects a join', () => {
    const two = lobby()
    const rejected = joinRoom(two, { name: 'cid', playerId: P3 }, 300)
    expect(rejected.ok).toBe(false)
    if (!rejected.ok) expect('state' in rejected).toBe(false)
    expect(two.players).toHaveLength(MAX_PLAYERS)
  })

  it('rejoins with the same id without duplicating the player or resetting the score', () => {
    const before = started()
    const scored = ok(submitAnswer(before, P1, 0, correctFor(before), 20))
    expect(scored.scores[P1]).toBe(1)

    const rejoined = unwrap(
      joinRoom(scored, { name: 'ana renamed', playerId: P1 }, 30)
    ).state
    expect(rejoined.players).toHaveLength(MAX_PLAYERS)
    expect(rejoined.players.map((p) => p.id)).toEqual([P1, P2])
    expect(rejoined.players[0]!.name).toBe('ana renamed')
    expect(rejoined.players[0]!.joinedAt).toBe(1000)
    expect(rejoined.scores).toEqual({ [P1]: 1, [P2]: 0 })
    expect(rejoined.round).toEqual(scored.round)
    expect(rejoined.session).toBe(scored.session)
  })

  it('trims the name and caps it at 24 characters', () => {
    expect(join(emptyRoom(), P1, '   ana   ').players[0]!.name).toBe('ana')
    expect(join(emptyRoom(), P1, 'n'.repeat(40)).players[0]!.name).toBe('n'.repeat(24))
  })

  it('rejects a blank name or a missing player id', () => {
    expect(error(joinRoom(emptyRoom(), { name: '   ', playerId: P1 }, 1))).toBe('invalid_name')
    expect(error(joinRoom(emptyRoom(), { name: 'ana', playerId: '' }, 1))).toBe('invalid_player')
  })

  it('rejects a brand new player once the game started, even though the room is full', () => {
    const playing = started()
    expect(playing.players).toHaveLength(MAX_PLAYERS)
    // game_in_progress wins over room_full: "the room is closed" is the truth
    // that stays correct after the game ends.
    expect(error(joinRoom(playing, { name: 'cid', playerId: P3 }, 40))).toBe('game_in_progress')
    expect(error(joinRoom(playToEnd(started()), { name: 'cid', playerId: P3 }, 40))).toBe(
      'game_in_progress'
    )
  })
})

describe('startGame', () => {
  it('needs two players before it can start', () => {
    expect(error(startGame(solo(), {}, 10, seeded(1)))).toBe('need_two_players')
    expect(error(startGame(emptyRoom(), {}, 10, seeded(1)))).toBe('need_two_players')
  })

  it('cannot start twice', () => {
    expect(error(startGame(started(), { count: 2 }, 20, seeded(2)))).toBe('already_started')
  })

  it('moves the room to round zero with zeroed scores', () => {
    const room = lobby()
    const result = unwrap(startGame(room, { count: 3 }, 55, seeded(1)))

    expect(result.state.phase).toBe('playing')
    expect(result.state.mode).toBe('write-all')
    expect(result.state.round).toEqual({ index: 0, answers: [], winnerId: null })
    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 0 })
    expect(result.state.session!.currentIndex).toBe(0)
    expect(result.state.session!.verbCount).toBe(3)
    expect(result.state.session!.sessionStartTime).toBe(55)

    expect(result.events.map((e) => e.t)).toEqual(['state', 'round'])
    expect(result.events[1]).toEqual({
      t: 'round',
      index: 0,
      total: 3,
      hint: hintFor(result.state),
    })
    expect(result.events[1]!.t === 'round' && result.events[1]!.hint.spanish).toBe(
      verbAt(result.state, 0).spanish
    )
  })

  it('takes the session length from count', () => {
    expect(started({ count: 5 }, 4).session!.selectedVerbs).toHaveLength(5)
    expect(started({ count: 'all' }, 4).session!.selectedVerbs).toHaveLength(verbs.length)
    expect(publicRoom(started({ count: 5 })).totalRounds).toBe(5)
  })

  it('filters the session by type and level', () => {
    const byType = started({ type: 'irregular' }, 6)
    const irregular = new Set(filterVerbs(verbs, 'irregular', 'all').map((v) => v.base))
    expect(byType.session!.selectedType).toBe('irregular')
    expect(byType.session!.selectedLevel).toBe('all')
    expect(byType.session!.selectedVerbs).toHaveLength(3)
    for (const verb of byType.session!.selectedVerbs) {
      expect(verb.type).toBe('irregular')
      expect(irregular.has(verb.base)).toBe(true)
    }

    const byLevel = started({ level: 'A1' }, 6)
    expect(byLevel.session!.selectedLevel).toBe('A1')
    for (const verb of byLevel.session!.selectedVerbs) expect(verb.level).toBe('A1')

    const combined = started({ type: 'regular', level: 'A2' }, 6)
    for (const verb of combined.session!.selectedVerbs) {
      expect(verb.type).toBe('regular')
      expect(verb.level).toBe('A2')
    }
  })

  it('is deterministic for the same seed', () => {
    const room = lobby()
    const a = ok(startGame(room, { count: 4 }, 0, seeded(11)))
    const b = ok(startGame(room, { count: 4 }, 0, seeded(11)))
    expect(a.session!.selectedVerbs.map((v) => v.base)).toEqual(
      b.session!.selectedVerbs.map((v) => v.base)
    )
  })
})

describe('submitAnswer', () => {
  it('scores a correct answer, closes the round and emits result then round', () => {
    const room = started()
    const verb = verbAt(room, 0)
    const result = unwrap(submitAnswer(room, P1, 0, correctFor(room), 20))

    expect(result.state.scores).toEqual({ [P1]: 1, [P2]: 0 })
    expect(result.state.round).toEqual({ index: 1, answers: [], winnerId: null })
    expect(result.state.session!.currentIndex).toBe(1)
    expect(result.state.phase).toBe('playing')
    expect(result.events.map((e) => e.t)).toEqual(['progress', 'result', 'round'])

    expect(result.events[0]).toEqual({
      t: 'progress',
      index: 0,
      answered: [{ playerId: P1, correct: true }],
    })

    expect(resultEvent(result.events)).toEqual({
      t: 'result',
      index: 0,
      winnerId: P1,
      verb,
      answers: [
        {
          playerId: P1,
          correct: true,
          answers: { base: verb.base, past: verb.past, participle: verb.participle },
          at: 20,
        },
      ],
    })

    expect(result.events[2]).toEqual({
      t: 'round',
      index: 1,
      total: 3,
      hint: hintFor(result.state),
    })
  })

  it('keeps the round open on a wrong answer while the other player has not answered', () => {
    const result = unwrap(submitAnswer(started(), P1, 0, WRONG, 20))

    expect(result.events).toEqual([
      { t: 'progress', index: 0, answered: [{ playerId: P1, correct: false }] },
    ])
    expect(result.state.round!.index).toBe(0)
    expect(result.state.round!.answers).toHaveLength(1)
    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 0 })
    expect(publicRoom(result.state).roundIndex).toBe(0)
  })

  it('lets the second player win a round the first one got wrong', () => {
    const before = started()
    const afterP1 = ok(submitAnswer(before, P1, 0, WRONG, 20))
    const verb = verbAt(before, 0)
    const result = unwrap(submitAnswer(afterP1, P2, 0, correctFor(afterP1), 30))

    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 1 })
    const closed = resultEvent(result.events)
    expect(closed).toMatchObject({ index: 0, winnerId: P2, verb })
    expect(closed.answers.map((a) => a.playerId)).toEqual([P1, P2])
    expect(result.state.round!.index).toBe(1)
  })

  it('closes the round with no winner when both players answer wrong', () => {
    const before = started()
    const afterP1 = ok(submitAnswer(before, P1, 0, WRONG, 20))
    const result = unwrap(submitAnswer(afterP1, P2, 0, WRONG, 30))

    expect(result.events.map((e) => e.t)).toEqual(['progress', 'result', 'round'])
    const closed = resultEvent(result.events)
    expect(closed.index).toBe(0)
    expect(closed.winnerId).toBeNull()
    expect(closed.answers.map((a) => a.playerId)).toEqual([P1, P2])
    expect(closed.answers.every((a) => a.correct === false)).toBe(true)
    expect(result.state.scores).toEqual({ [P1]: 0, [P2]: 0 })
    expect(result.state.round!.index).toBe(1)
    expect(result.state.phase).toBe('playing')
  })

  it('rejects a second answer in the same round', () => {
    const before = started()
    const state = ok(submitAnswer(before, P1, 0, WRONG, 20))
    expect(error(submitAnswer(state, P1, 0, correctFor(before), 30))).toBe('already_answered')
  })

  it('rejects an answer for a round that already advanced', () => {
    const state = started()
    expect(error(submitAnswer(state, P1, 1, correctFor(state, 1), 20))).toBe('stale_round')
    expect(error(submitAnswer(state, P1, -1, WRONG, 20))).toBe('stale_round')
    const advanced = ok(submitAnswer(state, P1, 0, correctFor(state), 20))
    expect(error(submitAnswer(advanced, P2, 0, WRONG, 30))).toBe('stale_round')
  })

  it('rejects a player who is not in the room', () => {
    const state = started()
    expect(error(submitAnswer(state, P3, 0, correctFor(state), 20))).toBe('not_in_room')
  })

  it('rejects answers outside the playing phase', () => {
    expect(error(submitAnswer(lobby(), P1, 0, WRONG, 20))).toBe('not_playing')
    expect(error(submitAnswer(playToEnd(started()), P1, 0, WRONG, 40))).toBe('not_playing')
  })
})

describe('finishing the session', () => {
  it('ends the game on the last round and emits the final scores', () => {
    const lastRound = started({ count: 1 }, 3)
    const result = unwrap(submitAnswer(lastRound, P1, 0, correctFor(lastRound), 90))

    expect(result.state.phase).toBe('finished')
    expect(result.events.map((e) => e.t)).toEqual(['progress', 'result', 'finished'])
    expect(result.state.round!.winnerId).toBe(P1)
    expect(result.state.scores).toEqual({ [P1]: 1, [P2]: 0 })
    expect(result.events[2]).toEqual({
      t: 'finished',
      scores: { [P1]: 1, [P2]: 0 },
      players: result.state.players,
    })

    const room = publicRoom(result.state)
    expect(room.phase).toBe('finished')
    expect(room.hint).toBeNull()
  })

  it('plays a full session round by round', () => {
    const final = playToEnd(started({ count: 3 }, 5))
    expect(final.phase).toBe('finished')
    expect(final.scores).toEqual({ [P1]: 3, [P2]: 0 })
    expect(final.round!.index).toBe(2)
    expect(final.session!.currentIndex).toBe(2)
  })

  it('cannot start a new game once the room finished', () => {
    const final = playToEnd(started({ count: 2 }, 2))
    expect(error(startGame(final, { count: 2 }, 50, seeded(9)))).toBe('already_started')
  })
})

describe('publicRoom and hintFor', () => {
  it('never expose the past form or the participle', () => {
    const state = started({ count: 3 }, 2)
    const verb = verbAt(state, 0)

    expect(hintFor(state)).toEqual({ spanish: verb.spanish, type: verb.type, level: verb.level })
    expect(Object.keys(hintFor(state)!).sort()).toEqual(['level', 'spanish', 'type'])

    const open = publicRoom(state)
    expect(JSON.stringify(open)).not.toContain(verb.past)
    expect(JSON.stringify(open)).not.toContain(verb.participle)
    expect(JSON.stringify(open)).toContain(verb.spanish)

    const answered = publicRoom(ok(submitAnswer(state, P1, 0, WRONG, 20)))
    expect(JSON.stringify(answered)).not.toContain(verb.past)
    expect(JSON.stringify(answered)).not.toContain(verb.participle)
  })

  it('never leaks answers through the progress event', () => {
    const state = started({ count: 3 }, 2)
    const verb = verbAt(state, 0)
    const events = unwrap(submitAnswer(state, P1, 0, WRONG, 20)).events
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain(verb.past)
    expect(serialized).not.toContain(verb.participle)
  })

  it('describes the lobby without a round', () => {
    const room = lobby()
    expect(publicRoom(room)).toEqual({
      code: 'ABC123',
      phase: 'lobby',
      mode: 'write-all',
      players: [
        { id: P1, name: 'ana' },
        { id: P2, name: 'bea' },
      ],
      scores: { [P1]: 0, [P2]: 0 },
      roundIndex: null,
      totalRounds: null,
      hint: null,
    })
    expect(hintFor(room)).toBeNull()
  })
})
