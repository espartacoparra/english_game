import { describe, expect, it } from 'vitest'
import { COGNATE_ITEMS, FALSE_COGNATE_ITEMS } from '../app/data/practice'
import {
  answerFor,
  buildCognateQuizDeck,
  type CognateQuizItem,
} from '../app/data/cognateQuiz'

/** Deterministic RNG so a shuffled deck can be asserted twice. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function key(item: CognateQuizItem): string {
  return `${item.kind}:${item.english}`
}

describe('cognate quiz deck', () => {
  it('mixes every true cognate and every false cognate exactly once', () => {
    const deck = buildCognateQuizDeck(seeded(7))

    expect(deck).toHaveLength(COGNATE_ITEMS.length + FALSE_COGNATE_ITEMS.length)
    expect(new Set(deck.map(key)).size).toBe(deck.length)
    expect(deck.filter((item) => item.kind === 'cognate')).toHaveLength(COGNATE_ITEMS.length)
    expect(deck.filter((item) => item.kind === 'false-cognate')).toHaveLength(
      FALSE_COGNATE_ITEMS.length,
    )
  })

  it('keeps the source wording of each pool', () => {
    const deck = buildCognateQuizDeck(seeded(3))

    for (const source of COGNATE_ITEMS) {
      const item = deck.find((candidate) => candidate.kind === 'cognate' && candidate.english === source.english)
      expect(item).toMatchObject({
        kind: 'cognate',
        english: source.english,
        spanish: source.spanish,
        category: source.category,
      })
    }

    for (const source of FALSE_COGNATE_ITEMS) {
      const item = deck.find(
        (candidate) => candidate.kind === 'false-cognate' && candidate.english === source.english,
      )
      expect(item).toMatchObject({
        kind: 'false-cognate',
        english: source.english,
        looksLike: source.looksLike,
        realMeaning: source.realMeaning,
        falseMeaning: source.falseMeaning,
        example: source.example,
      })
    }
  })

  it('shuffles from the injected random source instead of pooling by kind', () => {
    const first = buildCognateQuizDeck(seeded(11))
    const second = buildCognateQuizDeck(seeded(11))
    const unshuffled = buildCognateQuizDeck(() => 0.5)

    expect(first).toEqual(second)
    expect(first.map(key)).not.toEqual(unshuffled.map(key))

    // Both kinds are spread through the deck: the first half is not all cognates.
    const firstKinds = new Set(first.slice(0, 10).map((item) => item.kind))
    expect(firstKinds.size).toBe(2)
  })

  it('derives the correct button from the item kind', () => {
    const deck = buildCognateQuizDeck(seeded(5))

    for (const item of deck) {
      expect(answerFor(item)).toBe(item.kind)
    }
  })
})
