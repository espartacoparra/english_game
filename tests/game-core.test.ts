import { describe, expect, it } from 'vitest'
import {
  applyAnswer,
  applyResult,
  createCustomSession,
  createSession,
  emptySession,
  filterVerbs,
  gradeAnswers,
  normalizedCompare,
  resetSession,
  retrySession,
  sessionAccuracy,
  sessionScore,
  shuffle,
} from '../app/core/game-core'
import type { Verb } from '../app/types/verb'

const go: Verb = {
  spanish: 'ir',
  base: 'go',
  past: 'went',
  participle: 'gone',
  type: 'irregular',
  level: 'A1',
}

const learn: Verb = {
  spanish: 'aprender',
  base: 'learn',
  past: 'learned/learnt',
  participle: 'learned/learnt',
  type: 'regular',
  level: 'A2',
}

const see: Verb = {
  spanish: 'ver',
  base: 'see',
  past: 'saw',
  participle: 'seen',
  type: 'irregular',
  level: 'A1',
}

const pool: Verb[] = [go, learn, see]

/** Deterministic RNG so shuffle order can be asserted. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('normalizedCompare', () => {
  it('accepts exact answers ignoring case and padding', () => {
    expect(normalizedCompare('go', 'go')).toBe(true)
    expect(normalizedCompare('  GO  ', 'go')).toBe(true)
  })

  it('accepts the alternatives listed in a slash form', () => {
    expect(normalizedCompare('were', 'was/were')).toBe(true)
    expect(normalizedCompare('was', 'was/were')).toBe(true)
  })

  it('accepts known spelling alternates', () => {
    expect(normalizedCompare('learnt', 'learned')).toBe(true)
    expect(normalizedCompare('learned', 'learnt')).toBe(true)
  })

  it('rejects a different answer', () => {
    expect(normalizedCompare('goed', 'went')).toBe(false)
    expect(normalizedCompare('', 'go')).toBe(false)
  })
})

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5]
    const output = shuffle(input, seeded(7))
    expect(output).not.toBe(input)
    expect(input).toEqual([1, 2, 3, 4, 5])
    expect([...output].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  it('is deterministic for the same seed and different across seeds', () => {
    const values = Array.from({ length: 20 }, (_, i) => i)
    expect(shuffle(values, seeded(1))).toEqual(shuffle(values, seeded(1)))
    expect(shuffle(values, seeded(1))).not.toEqual(shuffle(values, seeded(2)))
  })

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], seeded(1))).toEqual([])
    expect(shuffle(['only'], seeded(1))).toEqual(['only'])
  })
})

describe('filterVerbs', () => {
  it('filters by type', () => {
    expect(filterVerbs(pool, 'irregular', 'all').map((v) => v.base)).toEqual(['go', 'see'])
  })

  it('filters by level', () => {
    expect(filterVerbs(pool, 'all', 'A2').map((v) => v.base)).toEqual(['learn'])
  })

  it('combines type and level', () => {
    expect(filterVerbs(pool, 'irregular', 'A2')).toEqual([])
    expect(filterVerbs(pool, 'all', 'all')).toEqual(pool)
  })
})

describe('createSession', () => {
  it('takes the requested count and opens the session', () => {
    const session = createSession(pool, { mode: 'write-all', count: 2 }, 1000, seeded(3))
    expect(session.selectedVerbs).toHaveLength(2)
    expect(session.verbCount).toBe(2)
    expect(session.currentIndex).toBe(0)
    expect(session.isFinished).toBe(false)
    expect(session.results).toEqual([])
    expect(session.sessionStartTime).toBe(1000)
    expect(session.mode).toBe('write-all')
  })

  it('clamps the count to the available pool', () => {
    expect(createSession(pool, { mode: 'write-all', count: 99 }, 0).verbCount).toBe(3)
    expect(createSession(pool, { mode: 'write-all', count: 0 }, 0).verbCount).toBe(1)
  })

  it('uses the whole filtered pool for "all"', () => {
    const session = createSession(pool, { mode: 'write-all', count: 'all', level: 'A1' }, 0)
    expect(session.verbCount).toBe(2)
    expect(session.selectedVerbs.map((v) => v.base).sort()).toEqual(['go', 'see'])
  })

  it('falls back to the whole pool when the filter matches nothing', () => {
    const session = createSession(pool, { mode: 'write-all', count: 2, type: 'regular', level: 'B2' }, 0)
    expect(session.selectedVerbs).toHaveLength(2)
  })

  it('selects deterministically from the injected rng', () => {
    const a = createSession(pool, { mode: 'write-all', count: 3 }, 0, seeded(5))
    const b = createSession(pool, { mode: 'write-all', count: 3 }, 0, seeded(5))
    expect(a.selectedVerbs.map((v) => v.base)).toEqual(b.selectedVerbs.map((v) => v.base))
  })
})

describe('createCustomSession', () => {
  it('uses every custom verb exactly once and records the mode', () => {
    const session = createCustomSession([go, see], 'fill-missing', 50, seeded(2))
    expect(session.selectedVerbs.map((v) => v.base).sort()).toEqual(['go', 'see'])
    expect(session.verbCount).toBe(2)
    expect(session.mode).toBe('fill-missing')
    expect(session.sessionStartTime).toBe(50)
  })
})

describe('gradeAnswers', () => {
  it('marks a fully correct answer and trims it', () => {
    const graded = gradeAnswers(go, { base: ' go ', past: 'went', participle: 'gone' })
    expect(graded.correct).toBe(true)
    expect(graded.answers).toEqual({ base: 'go', past: 'went', participle: 'gone' })
  })

  it('marks a single wrong tense as incorrect', () => {
    expect(gradeAnswers(go, { base: 'go', past: 'goed', participle: 'gone' }).correct).toBe(false)
  })

  it('treats missing fields as empty strings', () => {
    const graded = gradeAnswers(go, {})
    expect(graded.correct).toBe(false)
    expect(graded.answers).toEqual({ base: '', past: '', participle: '' })
  })
})

describe('applyResult', () => {
  const base = createSession(pool, { mode: 'write-all', count: 2 }, 1000, seeded(1))

  it('advances the index and grows the streak on a correct answer', () => {
    const result = { verb: base.selectedVerbs[0]!, correct: true, userAnswers: { base: 'x', past: 'x', participle: 'x' } }
    const next = applyResult(base, result, 2000)
    expect(next.currentIndex).toBe(1)
    expect(next.streak).toBe(1)
    expect(next.maxStreak).toBe(1)
    expect(next.results).toHaveLength(1)
    expect(next.isFinished).toBe(false)
  })

  it('resets the streak but keeps maxStreak on a wrong answer', () => {
    const correct = { verb: base.selectedVerbs[0]!, correct: true, userAnswers: { base: 'x', past: 'x', participle: 'x' } }
    const wrong = { verb: base.selectedVerbs[1]!, correct: false, userAnswers: { base: '', past: '', participle: '' } }
    const afterCorrect = applyResult(base, correct, 2000)
    const afterWrong = applyResult(afterCorrect, wrong, 3000)
    expect(afterWrong.streak).toBe(0)
    expect(afterWrong.maxStreak).toBe(1)
  })

  it('finishes on the last verb and records the duration in seconds', () => {
    const first = { verb: base.selectedVerbs[0]!, correct: true, userAnswers: { base: 'x', past: 'x', participle: 'x' } }
    const second = { verb: base.selectedVerbs[1]!, correct: true, userAnswers: { base: 'x', past: 'x', participle: 'x' } }
    const afterFirst = applyResult(base, first, 2000)
    const afterSecond = applyResult(afterFirst, second, 6500)
    expect(afterSecond.isFinished).toBe(true)
    expect(afterSecond.currentIndex).toBe(1)
    expect(afterSecond.sessionDuration).toBe(6)
  })
})

describe('applyAnswer', () => {
  it('grades the answer and applies the same transition', () => {
    const base = createSession(pool, { mode: 'write-all', count: 2 }, 1000, seeded(1))
    const { state, result } = applyAnswer(
      base,
      go,
      { base: 'go', past: 'went', participle: 'gone' },
      2000
    )
    expect(result.correct).toBe(true)
    expect(state.streak).toBe(1)
    expect(state.results[0]).toEqual(result)
  })
})

describe('retrySession', () => {
  const base = createSession(pool, { mode: 'write-all', count: 3 }, 1000, seeded(1))

  it('keeps only the failed verbs and restarts the clock', () => {
    const withWrong = applyResult(
      base,
      { verb: go, correct: false, userAnswers: { base: '', past: '', participle: '' } },
      2000
    )
    const retried = retrySession(withWrong, 5000, seeded(2))
    expect(retried.selectedVerbs).toEqual([go])
    expect(retried.verbCount).toBe(1)
    expect(retried.currentIndex).toBe(0)
    expect(retried.results).toEqual([])
    expect(retried.isFinished).toBe(false)
    expect(retried.streak).toBe(0)
    expect(retried.sessionStartTime).toBe(5000)
  })

  it('returns the same state when everything was correct', () => {
    expect(retrySession(emptySession(), 5000)).toEqual(emptySession())
  })
})

describe('resetSession', () => {
  it('clears the game but keeps the filters', () => {
    const played = createSession(pool, { mode: 'fill-missing', count: 3, type: 'irregular', level: 'A1' }, 1000)
    const reset = resetSession(played)
    expect(reset.mode).toBe('write-all')
    expect(reset.verbCount).toBe(10)
    expect(reset.selectedVerbs).toEqual([])
    expect(reset.currentIndex).toBe(0)
    expect(reset.results).toEqual([])
    expect(reset.isFinished).toBe(false)
    expect(reset.streak).toBe(0)
    expect(reset.maxStreak).toBe(0)
    expect(reset.sessionDuration).toBe(0)
    expect(reset.selectedType).toBe('irregular')
    expect(reset.selectedLevel).toBe('A1')
  })
})

describe('score helpers', () => {
  it('counts only correct results', () => {
    const base = createSession(pool, { mode: 'write-all', count: 2 }, 0, seeded(1))
    const after = applyResult(
      applyResult(base, { verb: go, correct: true, userAnswers: { base: 'x', past: 'x', participle: 'x' } }, 1),
      { verb: see, correct: false, userAnswers: { base: '', past: '', participle: '' } },
      2
    )
    expect(sessionScore(after)).toBe(1)
    expect(sessionAccuracy(after)).toBe(50)
  })

  it('reports zero accuracy with no answers', () => {
    expect(sessionScore(emptySession())).toBe(0)
    expect(sessionAccuracy(emptySession())).toBe(0)
  })
})
