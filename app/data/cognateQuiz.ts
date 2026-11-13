/**
 * Mixed deck for the cognate classification game.
 *
 * Differentiating true cognates from false ones is only a real exercise when
 * both kinds show up in the same round: a deck with a single kind can be beaten
 * by clicking the same button every time. The two source pools stay in
 * `practice.ts` untouched (the room modes still deal them separately); this
 * module only merges them into one shuffleable, discriminable list.
 */

import {
  COGNATE_ITEMS,
  FALSE_COGNATE_ITEMS,
  type CognateItem,
  type FalseCognateItem,
} from './practice'

/** A real cognate: the English word means what the Spanish word means. */
export interface QuizCognate {
  kind: 'cognate'
  english: string
  spanish: string
  category: string
}

/** A false friend: the word only looks like the Spanish one. */
export interface QuizFalseCognate {
  kind: 'false-cognate'
  english: string
  looksLike: string
  realMeaning: string
  falseMeaning: string
  example: string
}

export type CognateQuizItem = QuizCognate | QuizFalseCognate

/** The two buttons the player has to choose from. */
export type CognateAnswer = 'cognate' | 'false-cognate'

/** Correct button for one item, derived from its kind so the UI never guesses. */
export function answerFor(item: CognateQuizItem): CognateAnswer {
  return item.kind
}

function toQuizItem(item: CognateItem | FalseCognateItem): CognateQuizItem {
  if ('category' in item) {
    return { kind: 'cognate', english: item.english, spanish: item.spanish, category: item.category }
  }
  return {
    kind: 'false-cognate',
    english: item.english,
    looksLike: item.looksLike,
    realMeaning: item.realMeaning,
    falseMeaning: item.falseMeaning,
    example: item.example,
  }
}

/**
 * Fisher-Yates over a copy. `random` is injectable so tests can pin the order;
 * the game passes `Math.random` (default) and gets a fresh mix per game.
 */
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swapAt = Math.floor(random() * (index + 1))
    const current = result[index]!
    result[index] = result[swapAt]!
    result[swapAt] = current
  }
  return result
}

/** Both pools merged and shuffled: every true cognate and every false friend. */
export function buildCognateQuizDeck(random: () => number = Math.random): CognateQuizItem[] {
  return shuffle(
    [...COGNATE_ITEMS, ...FALSE_COGNATE_ITEMS].map(toQuizItem),
    random,
  )
}
