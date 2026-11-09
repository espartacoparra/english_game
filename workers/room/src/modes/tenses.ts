import { filterVerbs, normalizedCompare, shuffle, type Rng } from '../../../../app/core/game-core'
import type { RoundReply } from '../../../../app/core/room-protocol'
import { verbs } from '../../../../app/data/verbs'
import type { TenseKey, Verb } from '../../../../app/types/verb'
import type { ModeGrade, ModeRound, ModeSetup, ModeSpec } from './spec'

/**
 * The `tenses` family: the player types the English forms of a Spanish verb.
 *
 * - `write-all`     asks for the three forms and reveals none.
 * - `fill-missing`  reveals one form and grades only the other two.
 *
 * Both are a race: the first correct reply closes the round.
 */

/** Order used everywhere: prompt, solution and the `fill-missing` rotation. */
export const TENSE_ORDER: TenseKey[] = ['base', 'past', 'participle']

interface TenseSecret {
  verb: Verb
  /** The form shown in the prompt, or null when the mode hides all of them. */
  given: TenseKey | null
}

/** A safe, finite round count: the pool always has at least one item. */
function roundLimit(setup: ModeSetup, available: number): number {
  if (setup.count === 'all') return available
  const requested = Number.isFinite(setup.count) ? Math.floor(setup.count) : 10
  return Math.min(Math.max(1, requested), available)
}

function createRound(verb: Verb, given: TenseKey | null): ModeRound {
  const secret: TenseSecret = { verb, given }
  return {
    prompt: {
      kind: 'tenses',
      spanish: verb.spanish,
      type: verb.type,
      level: verb.level,
      givenTense: given,
      givenForm: given ? verb[given] : null,
    },
    answer: TENSE_ORDER.map((tense) => verb[tense]).join(' / '),
    secret,
  }
}

/**
 * The mode's own item pool: the verb list, filtered by the start options.
 *
 * An empty filter falls back to the whole pool, the same rule the practice
 * screens use, so a start never yields a session without rounds.
 */
function tensesRounds(givenFor: (index: number) => TenseKey | null) {
  return (setup: ModeSetup, rng: Rng): ModeRound[] => {
    const filtered = filterVerbs(verbs, setup.type, setup.level)
    const available = filtered.length > 0 ? filtered : verbs
    const limit = roundLimit(setup, available.length)
    return shuffle(available, rng)
      .slice(0, limit)
      .map((verb, index) => createRound(verb, givenFor(index)))
  }
}

/**
 * Grades only the forms the round asked for.
 *
 * For `write-all` that is all three, which is exactly the practice-screen rule
 * in `app/core/game-core.ts`; `fill-missing` skips the form it revealed, so a
 * reply that also fills the given slot cannot change the outcome.
 */
function gradeTenses(round: ModeRound, reply: RoundReply): ModeGrade {
  if (reply.kind !== 'tenses') return { correct: false, points: 0, detail: null }
  const { verb, given } = round.secret as TenseSecret
  const required = TENSE_ORDER.filter((tense) => tense !== given)
  const answers = reply.answers ?? {}
  const submitted = required.map((tense) => (answers[tense] ?? '').trim())
  const correct = required.every((tense, index) => normalizedCompare(submitted[index]!, verb[tense]))

  return {
    correct,
    points: correct ? 1 : 0,
    detail: submitted.some((value) => value !== '') ? submitted.join(' / ') : null,
  }
}

export const writeAll: ModeSpec = {
  mode: 'write-all',
  family: 'tenses',
  close: { kind: 'first-correct' },
  createRounds: tensesRounds(() => null),
  grade: gradeTenses,
}

export const fillMissing: ModeSpec = {
  mode: 'fill-missing',
  family: 'tenses',
  close: { kind: 'first-correct' },
  // The revealed form rotates with the round: base, past, participle, base…
  createRounds: tensesRounds((index) => TENSE_ORDER[index % TENSE_ORDER.length]!),
  grade: gradeTenses,
}
