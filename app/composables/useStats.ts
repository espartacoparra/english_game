import { computed, ref } from 'vue'
import { verbs } from '~/data/verbs'
import type { StatsSummary, Verb, VerbMasteryStatus, VerbProgress, VerbStat } from '~/types/verb'

const STORAGE_KEY = 'verbmaster_stats_v1'

/** Consecutive correct answers required before a verb counts as mastered. */
export const MASTERY_STREAK = 3

// Global stats state (module-level singletons, shared across every consumer)
const stats = ref<Record<string, VerbStat>>({})
const isLoaded = ref(false)

function statKey(verbBase: string): string {
  return verbBase.trim().toLowerCase()
}

function loadStats(): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, VerbStat>
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        stats.value = parsed
      }
    }
  } catch (err) {
    console.error('Failed to load stats from localStorage', err)
  } finally {
    isLoaded.value = true
  }
}

function saveStats(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats.value))
  } catch (err) {
    console.error('Failed to save stats to localStorage', err)
  }
}

function loadIfNotLoaded(): void {
  if (!isLoaded.value) {
    loadStats()
  }
}

function recordAnswer(verb: Verb, correct: boolean): void {
  loadIfNotLoaded()

  const key = statKey(verb.base)
  const existing = stats.value[key]

  const streak = correct ? (existing?.streak ?? 0) + 1 : 0
  const next: VerbStat = {
    verbBase: verb.base,
    attempts: (existing?.attempts ?? 0) + 1,
    correct: (existing?.correct ?? 0) + (correct ? 1 : 0),
    incorrect: (existing?.incorrect ?? 0) + (correct ? 0 : 1),
    streak,
    bestStreak: Math.max(existing?.bestStreak ?? 0, streak),
    lastSeenAt: Date.now(),
  }

  stats.value[key] = next
  saveStats()
}

/** Thin readability wrappers around recordAnswer. */
function recordSuccess(verb: Verb): void {
  recordAnswer(verb, true)
}

function recordMistake(verb: Verb): void {
  recordAnswer(verb, false)
}

function clearStats(): void {
  loadIfNotLoaded()
  stats.value = {}
  saveStats()
}

function statusFromStat(stat: VerbStat | null): VerbMasteryStatus {
  if (stat && stat.streak >= MASTERY_STREAK) return 'mastered'
  if (stat && stat.attempts > 0) return 'learning'
  return 'unseen'
}

function accuracyFromStat(stat: VerbStat | null): number {
  if (!stat || stat.attempts <= 0) return 0
  return Math.round((stat.correct / stat.attempts) * 100)
}

function progressFor(verb: Verb): VerbProgress {
  const stat = stats.value[statKey(verb.base)] ?? null
  return { verb, stat, status: statusFromStat(stat), accuracy: accuracyFromStat(stat) }
}

const progress = computed<VerbProgress[]>(() => verbs.map((verb) => progressFor(verb)))

const summary = computed<StatsSummary>(() => {
  let totalAttempts = 0
  let totalCorrect = 0
  let totalIncorrect = 0
  let masteredCount = 0
  let learningCount = 0
  let unseenCount = 0
  let bestStreak = 0

  const all = Object.values(stats.value)
  for (const stat of all) {
    totalAttempts += stat.attempts
    totalCorrect += stat.correct
    totalIncorrect += stat.incorrect
    if (stat.bestStreak > bestStreak) bestStreak = stat.bestStreak
  }

  for (const item of progress.value) {
    if (item.status === 'mastered') masteredCount++
    else if (item.status === 'learning') learningCount++
    else unseenCount++
  }

  return {
    totalAttempts,
    totalCorrect,
    totalIncorrect,
    accuracy: totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    masteredCount,
    learningCount,
    unseenCount,
    totalVerbs: verbs.length,
    bestStreak,
  }
})

const masteredVerbs = computed<VerbProgress[]>(() => {
  return progress.value
    .filter((item) => item.status === 'mastered')
    .sort((a, b) => (b.stat?.lastSeenAt ?? 0) - (a.stat?.lastSeenAt ?? 0))
})

const unmasteredVerbs = computed<VerbProgress[]>(() => {
  return progress.value
    .filter((item) => item.status !== 'mastered')
    .sort((a, b) => {
      const incorrectDiff = (b.stat?.incorrect ?? 0) - (a.stat?.incorrect ?? 0)
      if (incorrectDiff !== 0) return incorrectDiff
      const attemptsDiff = (b.stat?.attempts ?? 0) - (a.stat?.attempts ?? 0)
      if (attemptsDiff !== 0) return attemptsDiff
      return a.verb.base.localeCompare(b.verb.base)
    })
})

const problemVerbs = computed<Verb[]>(() => {
  return unmasteredVerbs.value
    .filter((item) => (item.stat?.incorrect ?? 0) > 0)
    .map((item) => item.verb)
})

function statusFor(verbBase: string): VerbMasteryStatus {
  loadIfNotLoaded()
  return statusFromStat(stats.value[statKey(verbBase)] ?? null)
}

function accuracyFor(verbBase: string): number {
  loadIfNotLoaded()
  return accuracyFromStat(stats.value[statKey(verbBase)] ?? null)
}

function lastSeenFor(verbBase: string): number | null {
  const stat = stats.value[statKey(verbBase)]
  return stat ? stat.lastSeenAt : null
}

export function useStats() {
  loadIfNotLoaded()

  return {
    stats,
    isLoaded,
    recordAnswer,
    recordSuccess,
    recordMistake,
    clearStats,
    summary,
    progress,
    masteredVerbs,
    unmasteredVerbs,
    problemVerbs,
    statusFor,
    accuracyFor,
    lastSeenFor,
  }
}
