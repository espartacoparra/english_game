import type { GameMode, GameResult, TenseKey, Verb, VerbLevel, VerbType } from '../types/verb'

/**
 * Pure game core.
 *
 * No state, no globals, no clock or randomness of its own: callers inject `now`
 * and `rng`. That lets the browser and an authoritative server runtime share the
 * exact same rules.
 */

export type Rng = () => number

export interface GameSessionState {
  mode: GameMode
  verbCount: number
  selectedType: VerbType | 'all'
  selectedLevel: VerbLevel | 'all'
  selectedVerbs: Verb[]
  currentIndex: number
  results: GameResult[]
  isFinished: boolean
  streak: number
  maxStreak: number
  sessionStartTime: number
  sessionDuration: number
}

export interface SessionOptions {
  mode: GameMode
  count: number | 'all'
  type?: VerbType | 'all'
  level?: VerbLevel | 'all'
}

export function shuffle<T>(array: T[], rng: Rng = Math.random): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const ALTERNATES: Record<string, string[]> = {
  learnt: ['learned'],
  learned: ['learnt'],
  burnt: ['burned'],
  burned: ['burnt'],
  dreamt: ['dreamed'],
  dreamed: ['dreamt'],
  smelt: ['smelled'],
  smelled: ['smelt'],
  spelt: ['spelled'],
  spelled: ['spelt'],
  spilt: ['spilled'],
  spilled: ['spilt'],
  gotten: ['got'],
  got: ['gotten'],
}

export function normalizedCompare(userAnswer: string, expectedAnswer: string): boolean {
  const u = userAnswer.trim().toLowerCase()
  const exp = expectedAnswer.trim().toLowerCase()

  if (u === exp) return true

  // Slashes like "was/were" or alternative spellings.
  const parts = exp.split('/').map((s) => s.trim().toLowerCase())
  if (parts.includes(u)) return true

  const alternates = ALTERNATES[exp]
  return Boolean(alternates && alternates.includes(u))
}

export function filterVerbs(
  pool: Verb[],
  type: VerbType | 'all',
  level: VerbLevel | 'all'
): Verb[] {
  return pool.filter((v) => {
    const matchType = type === 'all' || v.type === type
    const matchLevel = level === 'all' || v.level === level
    return matchType && matchLevel
  })
}

export function emptySession(): GameSessionState {
  return {
    mode: 'write-all',
    verbCount: 10,
    selectedType: 'all',
    selectedLevel: 'all',
    selectedVerbs: [],
    currentIndex: 0,
    results: [],
    isFinished: false,
    streak: 0,
    maxStreak: 0,
    sessionStartTime: 0,
    sessionDuration: 0,
  }
}

export function createSession(
  pool: Verb[],
  options: SessionOptions,
  now: number,
  rng: Rng = Math.random
): GameSessionState {
  const type = options.type ?? 'all'
  const level = options.level ?? 'all'
  const filtered = filterVerbs(pool, type, level)
  const available = filtered.length > 0 ? filtered : pool
  const limit =
    options.count === 'all'
      ? available.length
      : Math.min(Math.max(1, options.count), available.length)

  return {
    ...emptySession(),
    mode: options.mode,
    selectedType: type,
    selectedLevel: level,
    verbCount: limit,
    selectedVerbs: shuffle(available, rng).slice(0, limit),
    sessionStartTime: now,
  }
}

export function createCustomSession(
  customVerbs: Verb[],
  mode: GameMode,
  now: number,
  rng: Rng = Math.random
): GameSessionState {
  return {
    ...emptySession(),
    mode,
    verbCount: customVerbs.length,
    selectedVerbs: shuffle(customVerbs, rng),
    sessionStartTime: now,
  }
}

export function gradeAnswers(
  verb: Verb,
  answers: Partial<Record<TenseKey, string>>
): { correct: boolean; answers: Record<TenseKey, string> } {
  const trimmed: Record<TenseKey, string> = {
    base: answers.base?.trim() ?? '',
    past: answers.past?.trim() ?? '',
    participle: answers.participle?.trim() ?? '',
  }

  const correct =
    normalizedCompare(trimmed.base, verb.base) &&
    normalizedCompare(trimmed.past, verb.past) &&
    normalizedCompare(trimmed.participle, verb.participle)

  return { correct, answers: trimmed }
}

export function applyResult(
  state: GameSessionState,
  result: GameResult,
  now: number
): GameSessionState {
  const streak = result.correct ? state.streak + 1 : 0
  const maxStreak = Math.max(state.maxStreak, streak)
  const isLast = state.currentIndex >= state.selectedVerbs.length - 1

  return {
    ...state,
    results: [...state.results, result],
    streak,
    maxStreak,
    currentIndex: isLast ? state.currentIndex : state.currentIndex + 1,
    isFinished: isLast ? true : state.isFinished,
    sessionDuration: isLast
      ? Math.round((now - state.sessionStartTime) / 1000)
      : state.sessionDuration,
  }
}

export function applyAnswer(
  state: GameSessionState,
  verb: Verb,
  answers: Partial<Record<TenseKey, string>>,
  now: number
): { state: GameSessionState; result: GameResult } {
  const graded = gradeAnswers(verb, answers)
  const result: GameResult = {
    verb,
    correct: graded.correct,
    userAnswers: graded.answers,
  }

  return { result, state: applyResult(state, result, now) }
}

export function retrySession(
  state: GameSessionState,
  now: number,
  rng: Rng = Math.random
): GameSessionState {
  const failed = state.results.filter((r) => !r.correct).map((r) => r.verb)
  if (failed.length === 0) return state

  return {
    ...state,
    selectedVerbs: shuffle(failed, rng),
    verbCount: failed.length,
    currentIndex: 0,
    results: [],
    isFinished: false,
    streak: 0,
    maxStreak: 0,
    sessionStartTime: now,
  }
}

export function resetSession(state: GameSessionState): GameSessionState {
  return {
    ...state,
    mode: 'write-all',
    verbCount: 10,
    selectedVerbs: [],
    currentIndex: 0,
    results: [],
    isFinished: false,
    streak: 0,
    maxStreak: 0,
    sessionDuration: 0,
  }
}

export function sessionScore(state: GameSessionState): number {
  return state.results.filter((r) => r.correct).length
}

export function sessionAccuracy(state: GameSessionState): number {
  if (state.results.length === 0) return 0
  return Math.round((sessionScore(state) / state.results.length) * 100)
}
