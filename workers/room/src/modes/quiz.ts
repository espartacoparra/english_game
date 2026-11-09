import { shuffle, type Rng } from '../../../../app/core/game-core'
import type {
  ChoiceOption,
  ChoiceRoundPrompt,
  RoundReply,
} from '../../../../app/core/room-protocol'
import {
  COGNATE_ITEMS,
  FALSE_COGNATE_ITEMS,
  type CognateItem,
  type FalseCognateItem,
} from '../../../../app/data/practice'
import type { ModeGrade, ModeRound, ModeSetup, ModeSpec } from './spec'

/**
 * The `choice` family: cognates and false-cognates as objective quiz duels.
 *
 * The practice screens ask the player to grade themselves; the room cannot, so
 * both modes turn into one question with four options and one right answer.
 * The first correct pick closes the round, the same race as `write-all`.
 *
 * Everything is derived from the injected `rng`: which items a room deals, which
 * neighbours become the distractors and where the right option lands. The ids
 * are positional (`o1`…`o4`) so an id never spells out its own label.
 */

/** One right label and three wrong ones from the same pool. */
export const OPTION_COUNT = 4

/**
 * What a correct pick pays: one point, the same a round of `write-all` pays.
 * The other modes keep their own scale (a board participle pays two).
 */
export const CHOICE_POINTS = 1

/** A pool item resolved into the public phrasing and the label it grades on. */
interface ChoiceCandidate {
  /** The word the question is about. */
  item: string
  question: string
  hint: string | null
  /** The one right label, and the round's readable solution. */
  label: string
  /** A wrong label the item itself brings along, when its pool has one. */
  trap: string | null
}

/** What only the server sees: the round's right option id. */
interface ChoiceSecret {
  correctId: string
  label: string
}

/** Case- and space-insensitive identity, so two spellings never share a slot. */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase()
}

/** A safe, finite round count: the pool always has at least one item. */
function roundLimit(setup: ModeSetup, available: number): number {
  if (setup.count === 'all') return available
  const requested = Number.isFinite(setup.count) ? Math.floor(setup.count) : 10
  return Math.min(Math.max(1, requested), available)
}

/**
 * The labels the options show: the right one first, then distinct wrong ones.
 *
 * The item's own trap goes in before the pool draws, so a false cognate always
 * offers the meaning it looks like. Nothing is padded: the smallest pool holds
 * forty labels, so three distinct distractors always exist.
 */
function optionLabels(candidate: ChoiceCandidate, pool: string[], rng: Rng): string[] {
  const taken = new Set([normalizeLabel(candidate.label)])
  const labels = [candidate.label]

  const take = (label: string): void => {
    const key = normalizeLabel(label)
    if (key === '' || taken.has(key)) return
    taken.add(key)
    labels.push(label)
  }

  if (candidate.trap !== null) take(candidate.trap)
  for (const label of shuffle(pool, rng)) {
    if (labels.length >= OPTION_COUNT) break
    take(label)
  }
  return labels
}

function createRound(candidate: ChoiceCandidate, pool: string[], rng: Rng): ModeRound {
  // The shuffler decides the order and the ids follow position, so the id of
  // the right option varies from round to round without ever naming its label.
  const ordered = shuffle(
    optionLabels(candidate, pool, rng).map((label) => ({ label, correct: label === candidate.label })),
    rng
  )
  const options: ChoiceOption[] = ordered.map((option, index) => ({
    id: `o${index + 1}`,
    label: option.label,
  }))
  const correctIndex = ordered.findIndex((option) => option.correct)
  const secret: ChoiceSecret = { correctId: `o${correctIndex + 1}`, label: candidate.label }

  const prompt: ChoiceRoundPrompt = {
    kind: 'choice',
    item: candidate.item,
    question: candidate.question,
    hint: candidate.hint,
    options,
  }
  return { prompt, answer: candidate.label, secret }
}

/**
 * Shuffling before slicing is what keeps an item to one round per room: a dealt
 * item is never dealt again, whatever the requested count.
 */
function createChoices(
  candidates: ChoiceCandidate[],
  setup: ModeSetup,
  rng: Rng
): ModeRound[] {
  const labels = candidates.map((candidate) => candidate.label)
  return shuffle(candidates, rng)
    .slice(0, roundLimit(setup, candidates.length))
    .map((candidate) => createRound(candidate, labels, rng))
}

/**
 * The `cognates` question: the English word is shown, the Spanish equivalent is
 * asked for, and the category of the pair is the hint.
 *
 * The English word is part of the question as well, so the question stands on
 * its own even after the item card scrolls away.
 */
function cognateCandidates(pool: CognateItem[]): ChoiceCandidate[] {
  return pool.map((cognate) => ({
    item: cognate.english,
    question: `¿Cuál es el equivalente en español de «${cognate.english}»?`,
    hint: `Categoría: ${cognate.category}`,
    label: cognate.spanish,
    trap: null,
  }))
}

/**
 * The English half of a pool example, which is what a hint may show.
 *
 * Each example is a pair, English then Spanish, joined by ` = `. Only the
 * English side is a hint; the Spanish side is the answer. If an item ever came
 * without that separator the hint is dropped rather than printed, because a
 * hint that carries the answer is worse than no hint at all.
 */
function englishExample(example: string, label: string): string | null {
  const [englishSide] = example.split(' = ')
  if (englishSide === undefined || englishSide === example) return null
  const hint = englishSide.trim().replace(/^"|"$/g, '').trim()
  if (hint === '') return null
  if (normalizeLabel(hint).includes(normalizeLabel(label))) return null
  return hint
}

/**
 * The `false-cognates` question: the item looks like one Spanish word and means
 * another, so the question names both and asks for the real one.
 *
 * The trap meaning is one of the options; the rest come from other items of the
 * pool, so every wrong option is a real meaning somebody could choose.
 */
function falseCognateCandidates(pool: FalseCognateItem[]): ChoiceCandidate[] {
  return pool.map((item) => ({
    item: item.english,
    question: `¿Cuál es el significado real de «${item.english}»? Ojo: se parece a «${item.looksLike}».`,
    hint: englishExample(item.example, item.realMeaning),
    label: item.realMeaning,
    trap: item.falseMeaning,
  }))
}

/**
 * Grades the pick against the round's secret id.
 *
 * The label the client sent is never read: an option id is the only thing a
 * reply carries, so echoing the right label under another id earns nothing.
 * `detail` is the right label, the same text the round shows as its solution.
 */
function gradeChoice(round: ModeRound, reply: RoundReply): ModeGrade {
  if (reply.kind !== 'choice') return { correct: false, points: 0, detail: null }
  const secret = round.secret as ChoiceSecret
  const correct = reply.optionId === secret.correctId
  return { correct, points: correct ? CHOICE_POINTS : 0, detail: secret.label }
}

/** True cognates: the pair keeps its meaning, so the Spanish word is asked for. */
export const cognates: ModeSpec = {
  mode: 'cognates',
  family: 'choice',
  close: { kind: 'first-correct' },
  createRounds: (setup, rng) => createChoices(cognateCandidates(COGNATE_ITEMS), setup, rng),
  grade: gradeChoice,
}

/** False cognates: the word is a trap, so the real meaning is asked for. */
export const falseCognates: ModeSpec = {
  mode: 'false-cognates',
  family: 'choice',
  close: { kind: 'first-correct' },
  createRounds: (setup, rng) =>
    createChoices(falseCognateCandidates(FALSE_COGNATE_ITEMS), setup, rng),
  grade: gradeChoice,
}
