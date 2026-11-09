import { describe, expect, it } from 'vitest'
import type { ListRoundPrompt, RoundReply } from '../app/core/room-protocol'
import { ANTONYM_ITEMS, SYNONYM_ITEMS } from '../app/data/practice'
import type { ModeRound, ModeSetup, ModeSpec } from '../workers/room/src/modes/spec'
import { antonyms, synonyms } from '../workers/room/src/modes/words'

/** Deterministic RNG so the dealt rounds can be asserted. */
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

/** One item of a practice pool, in the shape both lists share. */
interface PoolItem {
  word: string
  hint: string
  accepted: string[]
}

interface Fixture {
  name: 'synonyms' | 'antonyms'
  spec: ModeSpec
  pool: PoolItem[]
}

const FIXTURES: Fixture[] = [
  {
    name: 'synonyms',
    spec: synonyms,
    pool: SYNONYM_ITEMS.map(({ word, hint, synonyms: list }) => ({
      word,
      hint,
      accepted: list,
    })),
  },
  {
    name: 'antonyms',
    spec: antonyms,
    pool: ANTONYM_ITEMS.map(({ word, hint, antonyms: list }) => ({
      word,
      hint,
      accepted: list,
    })),
  },
]

function setup(overrides: Partial<ModeSetup> = {}): ModeSetup {
  return { count: 3, type: 'all', level: 'all', players: [P1, P2], ...overrides }
}

function build(fixture: Fixture, overrides: Partial<ModeSetup> = {}, seed = 1): ModeRound[] {
  return fixture.spec.createRounds(setup(overrides), seeded(seed))
}

function promptOf(round: ModeRound): ListRoundPrompt {
  if (round.prompt.kind !== 'list') throw new Error('the round is not a list round')
  return round.prompt
}

/**
 * The accepted list of a round, resolved through the public data pool the way a
 * player knows the words. The round never hands it out.
 */
function acceptedOf(fixture: Fixture, round: ModeRound): string[] {
  const { word } = promptOf(round)
  const item = fixture.pool.find((entry) => entry.word === word)
  if (!item) throw new Error(`unknown word: ${word}`)
  return item.accepted
}

function listReply(items: unknown): RoundReply {
  return { kind: 'list', items } as RoundReply
}

function gradeOf(
  fixture: Fixture,
  round: ModeRound,
  items: unknown,
  playerId: string = P1
): { correct: boolean; points: number; detail: string | null } {
  return fixture.spec.grade(round, listReply(items), playerId)
}

/** Every string a payload carries, without its keys. */
function publicValues(value: unknown): string[] {
  const found: string[] = []
  const walk = (entry: unknown): void => {
    if (typeof entry === 'string') found.push(entry)
    else if (Array.isArray(entry)) entry.forEach(walk)
    else if (entry && typeof entry === 'object') Object.values(entry).forEach(walk)
  }
  walk(value)
  return found
}

/** The mode's own round data. It never leaves the server, so tests read it here. */
function rosterOf(round: ModeRound): string[] {
  return (round.secret as { players: string[] }).players
}

function wordsOf(rounds: ModeRound[]): string[] {
  return rounds.map((round) => promptOf(round).word)
}

for (const fixture of FIXTURES) {
  const { name, spec, pool } = fixture

  describe(`the ${name} mode`, () => {
    it('is a list round that closes once every player answered', () => {
      expect(spec.mode).toBe(name)
      expect(spec.family).toBe('list')
      // Never closable by one early answer: every player replies first.
      expect(spec.close).toEqual({ kind: 'all-answered' })
    })

    it('never shows the accepted items, only how many exist', () => {
      for (const round of build(fixture, { count: 'all' })) {
        const prompt = promptOf(round)
        const accepted = acceptedOf(fixture, round)

        expect(Object.keys(prompt).sort()).toEqual([
          'expectedCount',
          'hint',
          'kind',
          'word',
        ])
        expect(prompt.expectedCount).toBe(accepted.length)
        // The prompt carries the word and the hint and nothing else, so no
        // accepted item and no list can travel with it.
        expect(prompt.kind).toBe('list')
        const shown = publicValues(prompt).map((value) => value.trim().toLowerCase())
        for (const item of accepted) {
          expect(shown).not.toContain(item.trim().toLowerCase())
        }
        // The readable solution is public only after the round closes.
        expect(round.answer).toBe(accepted.join(', '))
      }
    })

    it('builds the requested number of rounds from the pool', () => {
      expect(build(fixture, { count: 3 })).toHaveLength(3)
      expect(build(fixture, { count: 'all' })).toHaveLength(pool.length)
      // A count the pool cannot satisfy stops at the pool, and nothing asks for
      // a session without rounds.
      expect(build(fixture, { count: 0 })).toHaveLength(1)
      expect(build(fixture, { count: 999 })).toHaveLength(pool.length)
    })

    it('never repeats an item inside one room', () => {
      const rounds = build(fixture, { count: 'all' })
      expect(new Set(wordsOf(rounds)).size).toBe(rounds.length)
      // Every word of a full session is a word of the pool, dealt once.
      expect([...wordsOf(rounds)].sort()).toEqual(pool.map((item) => item.word).sort())
    })

    it('deals the same rounds for the same rng and a different order for another', () => {
      const first = build(fixture, { count: 5 }, 7)
      const again = build(fixture, { count: 5 }, 7)
      const other = build(fixture, { count: 5 }, 8)

      expect(wordsOf(again)).toEqual(wordsOf(first))
      expect(again.map((round) => round.answer)).toEqual(first.map((round) => round.answer))
      expect(wordsOf(other)).not.toEqual(wordsOf(first))
    })

    it('reads its pool regardless of the verb type and level', () => {
      // The practice items carry no verb type or level, so the filter can only
      // fall back to the whole pool: a narrow start still yields rounds.
      const narrow = build(fixture, { count: 'all', type: 'regular', level: 'beginner' })
      expect(wordsOf(narrow)).toHaveLength(pool.length)
      expect([...wordsOf(narrow)].sort()).toEqual(pool.map((item) => item.word).sort())
    })

    it('scores one point per accepted item the player found', () => {
      const [round] = build(fixture)
      const accepted = acceptedOf(fixture, round!)

      const graded = gradeOf(fixture, round!, accepted)
      expect(graded.correct).toBe(true)
      expect(graded.points).toBe(accepted.length)
      expect(graded.detail).toBe(`${accepted.length}/${accepted.length}`)
    })

    it('scores exactly the matches of a partial answer', () => {
      const [round] = build(fixture)
      const accepted = acceptedOf(fixture, round!)
      const found = accepted.slice(0, 2)

      const graded = gradeOf(fixture, round!, found)
      expect(graded.correct).toBe(true)
      expect(graded.points).toBe(2)
      expect(graded.detail).toBe(`2/${accepted.length}`)
    })

    it('scores nothing for wrong items', () => {
      const [round] = build(fixture)
      const accepted = acceptedOf(fixture, round!)

      const graded = gradeOf(fixture, round!, ['zzz', 'not a word'])
      expect(graded.correct).toBe(false)
      expect(graded.points).toBe(0)
      expect(graded.detail).toBe(`0/${accepted.length}`)
    })

    it('ignores blanks and duplicates so nothing scores twice', () => {
      const [round] = build(fixture)
      const accepted = acceptedOf(fixture, round!)

      const graded = gradeOf(fixture, round!, [
        '',
        '   ',
        ...accepted,
        ...accepted,
        ...accepted.map((item) => item.toUpperCase()),
      ])
      expect(graded.points).toBe(accepted.length)
      expect(graded.detail).toBe(`${accepted.length}/${accepted.length}`)

      // The same word twice is one find, and blanks alone score nothing.
      expect(gradeOf(fixture, round!, [accepted[0], accepted[0]!.toUpperCase()]).points).toBe(1)
      expect(gradeOf(fixture, round!, ['', '  '])).toEqual({
        correct: false,
        points: 0,
        detail: `0/${accepted.length}`,
      })
      // A reply with no list at all is a miss, not a crash.
      expect(gradeOf(fixture, round!, undefined).points).toBe(0)
      expect(gradeOf(fixture, round!, [1, null, {}]).points).toBe(0)
    })

    it('honours the normalised comparison of the practice rules', () => {
      const [round] = build(fixture)
      const accepted = acceptedOf(fixture, round!)
      const target = accepted[0]!

      // Case and surrounding whitespace never change a find.
      for (const spelling of [target.toUpperCase(), `  ${target}  `, ` ${target.toUpperCase()}\t`]) {
        expect(gradeOf(fixture, round!, [spelling]).points).toBe(1)
      }
      expect(gradeOf(fixture, round!, [target.slice(0, 2)])).toEqual({
        correct: false,
        points: 0,
        detail: `0/${accepted.length}`,
      })
    })

    it('refuses a reply of another family without touching the round', () => {
      const [round] = build(fixture)
      const before = JSON.stringify(round)

      expect(spec.grade(round!, { kind: 'tenses', answers: { base: 'x' } }, P1)).toEqual({
        correct: false,
        points: 0,
        detail: null,
      })
      expect(JSON.stringify(round)).toBe(before)
    })

    it('grades purely: the same reply twice gives the same result', () => {
      const [round] = build(fixture)
      const accepted = acceptedOf(fixture, round!)
      const before = JSON.stringify(round)

      const first = gradeOf(fixture, round!, accepted.slice(0, 1))
      const second = gradeOf(fixture, round!, accepted.slice(0, 1))
      expect(second).toEqual(first)
      expect(JSON.stringify(round)).toBe(before)
    })

    it('drops a player who left from the round it waits for', () => {
      const [round] = build(fixture)
      const accepted = acceptedOf(fixture, round!)
      expect(rosterOf(round!)).toEqual([P1, P2])

      const after = spec.playerLeft!(round!, P2)
      expect(after).not.toBeNull()
      expect(rosterOf(after!)).toEqual([P1])
      // The leaver is already gone, so a second departure changes nothing.
      expect(spec.playerLeft!(after!, P2)).toBeNull()
      // An unknown player is not the mode's business, and the last player stays
      // so a round always waits for somebody.
      expect(spec.playerLeft!(after!, P3)).toBeNull()
      expect(spec.playerLeft!(after!, P1)).toBeNull()

      // The prompt, the solution and what another player scores are untouched.
      expect(promptOf(after!)).toEqual(promptOf(round!))
      expect(after!.answer).toBe(round!.answer)
      expect(gradeOf(fixture, after!, accepted)).toEqual(gradeOf(fixture, round!, accepted))
      expect(gradeOf(fixture, after!, accepted.slice(0, 1))).toEqual(
        gradeOf(fixture, round!, accepted.slice(0, 1))
      )
      // The round handed in stays as it was: the mode returns a new one.
      expect(rosterOf(round!)).toEqual([P1, P2])
      expect(gradeOf(fixture, round!, accepted)).toEqual(gradeOf(fixture, after!, accepted))
    })
  })
}

describe('the words modes together', () => {
  it('exposes one spec per mode, ready to be registered', () => {
    expect(synonyms.mode).toBe('synonyms')
    expect(antonyms.mode).toBe('antonyms')
    // Both are list rounds and neither decides its own ending.
    for (const spec of [synonyms, antonyms]) {
      expect(spec.family).toBe('list')
      expect(spec.close).toEqual({ kind: 'all-answered' })
      expect(typeof spec.createRounds).toBe('function')
      expect(typeof spec.grade).toBe('function')
      expect(typeof spec.playerLeft).toBe('function')
    }
  })

  it('reads its own pool: the two modes never deal the same words', () => {
    const synonymWords = wordsOf(synonyms.createRounds(setup({ count: 'all' }), seeded(1)))
    const antonymWords = wordsOf(antonyms.createRounds(setup({ count: 'all' }), seeded(1)))

    expect(synonymWords).toHaveLength(SYNONYM_ITEMS.length)
    expect(antonymWords).toHaveLength(ANTONYM_ITEMS.length)
    expect(synonymWords.some((word) => antonymWords.includes(word))).toBe(true)
    // Same seed, different pool: the order is not shared between the modes.
    expect(synonymWords).not.toEqual(antonymWords)
  })
})
