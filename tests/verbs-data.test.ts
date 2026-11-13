import { describe, expect, it } from 'vitest'
import { verbs } from '../app/data/verbs'

const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const
const TYPES = ['regular', 'irregular'] as const

describe('verb data', () => {
  it('offers at least 500 verbs', () => {
    expect(verbs.length).toBeGreaterThanOrEqual(500)
  })

  it('has one row per base form with every field the games read', () => {
    const bases = verbs.map((verb) => verb.base)

    expect(new Set(bases).size).toBe(bases.length)
    for (const verb of verbs) {
      expect(verb.spanish.trim()).not.toBe('')
      expect(verb.base.trim()).not.toBe('')
      expect(verb.past.trim()).not.toBe('')
      expect(verb.participle.trim()).not.toBe('')
      expect(LEVELS).toContain(verb.level)
    }
  })

  it('keeps regular conjugation -ed and identical past and participle', () => {
    const regular = verbs.filter((verb) => verb.type === 'regular')

    expect(regular.length).toBeGreaterThan(0)
    for (const verb of regular) {
      expect(verb.past).toBe(verb.participle)
      expect(verb.past).toMatch(/ed$/)
    }
  })

  it('keeps every type and level filter populated', () => {
    for (const type of TYPES) {
      for (const level of LEVELS) {
        expect(verbs.some((verb) => verb.type === type && verb.level === level)).toBe(true)
      }
    }
  })
})
