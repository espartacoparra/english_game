import { describe, expect, it } from 'vitest'
import type { ChoiceRoundPrompt, RoundReply } from '../app/core/room-protocol'
import { COGNATE_ITEMS, FALSE_COGNATE_ITEMS } from '../app/data/practice'
import {
  CHOICE_POINTS,
  OPTION_COUNT,
  cognates,
  falseCognates,
} from '../workers/room/src/modes/quiz'
import type { ModeRound, ModeSetup, ModeSpec } from '../workers/room/src/modes/spec'

/**
 * `cognates` and `false-cognates` are the `choice` family: one round is a
 * question, four options and exactly one right answer, graded on the option id
 * the server chose, never on a label the client sent.
 *
 * Everything here goes through the public specs (`createRounds`, `grade`, the
 * returned prompt), so the mode is proven without registering it.
 */

/** Deterministic RNG so the same seed rebuilds the same room. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const P1 = 'p1'
const P2 = 'p2'

function setup(count: number | 'all'): ModeSetup {
  return { count, type: 'all', level: 'all', players: [P1, P2] }
}

function promptOf(round: ModeRound): ChoiceRoundPrompt {
  return round.prompt as ChoiceRoundPrompt
}

function pick(optionId: string): RoundReply {
  return { kind: 'choice', optionId }
}

/** The ids this round grades as correct, found the way a player would. */
function correctIds(spec: ModeSpec, round: ModeRound): string[] {
  return promptOf(round)
    .options.filter((option) => spec.grade(round, pick(option.id), P1).correct)
    .map((option) => option.id)
}

interface QuizCase {
  name: 'cognates' | 'false-cognates'
  spec: ModeSpec
  /** Rounds a full session deals, one per item of the mode's own pool. */
  items: number
  /** Every label a round of this mode may legitimately show. */
  allowed: Set<string>
  /** False-cognate hints are examples: they must never print the answer. */
  hidesAnswerInHint: boolean
}

const CASES: QuizCase[] = [
  {
    name: 'cognates',
    spec: cognates,
    items: COGNATE_ITEMS.length,
    allowed: new Set(COGNATE_ITEMS.map((item) => item.spanish)),
    hidesAnswerInHint: false,
  },
  {
    name: 'false-cognates',
    spec: falseCognates,
    items: FALSE_COGNATE_ITEMS.length,
    allowed: new Set([
      ...FALSE_COGNATE_ITEMS.map((item) => item.realMeaning),
      ...FALSE_COGNATE_ITEMS.map((item) => item.falseMeaning),
    ]),
    hidesAnswerInHint: true,
  },
]

describe.each(CASES)('$name', (testCase) => {
  const { spec } = testCase

  it('declares the choice family and closes on the first correct answer', () => {
    expect(spec.mode).toBe(testCase.name)
    expect(spec.family).toBe('choice')
    expect(spec.close).toEqual({ kind: 'first-correct' })
  })

  it('builds four distinct options per round with exactly one correct', () => {
    const rounds = spec.createRounds(setup(10), seeded(7))

    expect(rounds).toHaveLength(10)
    for (const round of rounds) {
      const prompt = promptOf(round)

      expect(prompt.kind).toBe('choice')
      expect(prompt.options).toHaveLength(OPTION_COUNT)
      // One id and one label each, so a duplicated option cannot pass as two.
      expect(new Set(prompt.options.map((option) => option.id)).size).toBe(OPTION_COUNT)
      expect(new Set(prompt.options.map((option) => option.label)).size).toBe(OPTION_COUNT)
      // Exactly one option id is the right one.
      expect(correctIds(spec, round)).toHaveLength(1)
    }
  })

  it('keeps the option ids positional, opaque and stable across a re-serialisation', () => {
    const rounds = spec.createRounds(setup(10), seeded(9))

    for (const round of rounds) {
      const prompt = promptOf(round)

      expect(prompt.options.map((option) => option.id)).toEqual(['o1', 'o2', 'o3', 'o4'])
      for (const option of prompt.options) {
        // The id says where the option landed and nothing about its content.
        expect(option.id).not.toBe(option.label)
        expect(option.id).not.toContain(option.label)
        // The public option carries no verdict either.
        expect(Object.keys(option).sort()).toEqual(['id', 'label'])
      }
      expect(JSON.parse(JSON.stringify(prompt))).toEqual(prompt)
    }
  })

  it('draws every option from the same pool and repeats the answer only once', () => {
    const rounds = spec.createRounds(setup('all'), seeded(3))

    for (const round of rounds) {
      const prompt = promptOf(round)

      expect(prompt.options.filter((option) => option.label === round.answer)).toHaveLength(1)
      for (const option of prompt.options) {
        expect(testCase.allowed.has(option.label)).toBe(true)
      }
    }
  })

  it('grades only the option id the round made right', () => {
    const [round] = spec.createRounds(setup(1), seeded(13))
    const prompt = promptOf(round!)

    const [correctId] = correctIds(spec, round!)
    const accepted = spec.grade(round!, pick(correctId!), P1)

    expect(accepted).toMatchObject({
      correct: true,
      points: CHOICE_POINTS,
      detail: round!.answer,
    })

    for (const option of prompt.options.filter((entry) => entry.id !== correctId)) {
      const refused = spec.grade(round!, pick(option.id), P2)
      expect(refused.correct).toBe(false)
      expect(refused.points).toBe(0)
    }
  })

  it('refuses a forged reply that echoes the right label under another id', () => {
    const [round] = spec.createRounds(setup(1), seeded(17))
    const prompt = promptOf(round!)
    const [correctId] = correctIds(spec, round!)
    const other = prompt.options.find((option) => option.id !== correctId)!

    // The label as an id, the right label in the wrong slot, a sibling id and a
    // made-up id: none of them is the secret one.
    for (const forge of [round!.answer, other.id, 'o9', '', `${correctId} `]) {
      const graded = spec.grade(round!, pick(forge), P1)
      expect(graded.correct).toBe(false)
      expect(graded.points).toBe(0)
    }
  })

  it('grades a reply of another family as wrong without throwing', () => {
    const [round] = spec.createRounds(setup(1), seeded(19))
    const graded = spec.grade(round!, { kind: 'tenses', answers: {} }, P1)

    expect(graded.correct).toBe(false)
    expect(graded.points).toBe(0)
    expect(graded.detail).toBeNull()
  })

  it('is deterministic for a fixed rng', () => {
    const first = spec.createRounds(setup(10), seeded(42))
    const second = spec.createRounds(setup(10), seeded(42))
    const other = spec.createRounds(setup(10), seeded(43))

    expect(second).toEqual(first)
    // Fresh calls, so the rng is consumed exactly once per build.
    expect(spec.createRounds(setup(10), seeded(42))).toEqual(first)
    expect(other).not.toEqual(first)
  })

  it('never repeats an item inside one room', () => {
    const full = spec.createRounds(setup('all'), seeded(11))
    const short = spec.createRounds(setup(10), seeded(11))

    expect(full).toHaveLength(testCase.items)
    expect(new Set(full.map((round) => promptOf(round).item)).size).toBe(testCase.items)
    expect(new Set(short.map((round) => promptOf(round).item)).size).toBe(10)
  })

  it('clamps the round count to the pool it owns', () => {
    expect(spec.createRounds(setup('all'), seeded(5))).toHaveLength(testCase.items)
    expect(spec.createRounds(setup(testCase.items + 25), seeded(5))).toHaveLength(testCase.items)
    expect(spec.createRounds(setup(0), seeded(5))).toHaveLength(1)
    expect(spec.createRounds(setup(3), seeded(5))).toHaveLength(3)
  })

  it('asks a question that names the item and keeps the hint honest', () => {
    const rounds = spec.createRounds(setup('all'), seeded(23))

    for (const round of rounds) {
      const prompt = promptOf(round)

      expect(prompt.item.length).toBeGreaterThan(0)
      expect(prompt.question).toContain(prompt.item)
      expect(round.answer.length).toBeGreaterThan(0)
      if (testCase.hidesAnswerInHint) {
        if (prompt.hint !== null) {
          expect(prompt.hint.toLowerCase()).not.toContain(round.answer.toLowerCase())
        }
      }
    }
  })
})

describe('question wording', () => {
  it('asks cognates for the Spanish equivalent and uses the category as the hint', () => {
    const rounds = cognates.createRounds(setup('all'), seeded(31))
    const round = rounds.find((entry) => promptOf(entry).item === 'animal')!
    const prompt = promptOf(round)

    expect(prompt.question).toBe('¿Cuál es el equivalente en español de «animal»?')
    expect(prompt.hint).toBe('Categoría: General')
    expect(round.answer).toBe('animal')
    expect(prompt.options).toHaveLength(4)
    expect(prompt.options.map((option) => option.label)).toContain('animal')
    expect(prompt.options.map((option) => option.label).every((label) => label.length > 0)).toBe(true)
  })

  it('asks false-cognates for the real meaning with the English half of the example as hint', () => {
    const rounds = falseCognates.createRounds(setup('all'), seeded(37))
    const round = rounds.find((entry) => promptOf(entry).item === 'library')!
    const prompt = promptOf(round)
    const labels = prompt.options.map((option) => option.label)

    expect(prompt.question).toBe(
      '¿Cuál es el significado real de «library»? Ojo: se parece a «librería».'
    )
    expect(prompt.hint).toBe('I go to the library to study')
    expect(round.answer).toBe('biblioteca')
    // The true meaning, the trap and two neighbours from the same pool.
    expect(labels).toContain('biblioteca')
    expect(labels).toContain('librería (bookstore)')
    expect(labels.filter((label) => label === 'biblioteca')).toHaveLength(1)
  })
})
