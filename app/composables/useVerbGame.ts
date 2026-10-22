import { computed, ref } from 'vue'
import { verbs } from '~/data/verbs'
import type { GameMode, GameResult, TenseKey, Verb, VerbLevel, VerbType } from '~/types/verb'

export interface Card {
  id: string
  verb: Verb
  tense: TenseKey | 'spanish'
  label: string
  matched: boolean
}

// Global game state
const mode = ref<GameMode>('write-all')
const verbCount = ref<number>(10)
const selectedType = ref<VerbType | 'all'>('all')
const selectedLevel = ref<VerbLevel | 'all'>('all')
const selectedVerbs = ref<Verb[]>([])
const currentIndex = ref<number>(0)
const results = ref<GameResult[]>([])
const isFinished = ref<boolean>(false)

// Gameplay metrics
const streak = ref<number>(0)
const maxStreak = ref<number>(0)
const sessionStartTime = ref<number>(0)
const sessionDuration = ref<number>(0)

function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function normalizedCompare(userAnswer: string, expectedAnswer: string): boolean {
  const u = userAnswer.trim().toLowerCase()
  const exp = expectedAnswer.trim().toLowerCase()

  if (u === exp) return true

  // Handle slashes like "was/were" or alternative spellings
  const parts = exp.split('/').map((s) => s.trim().toLowerCase())
  if (parts.includes(u)) return true

  // Common alternate forms
  const alternates: Record<string, string[]> = {
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

  if (alternates[exp] && alternates[exp].includes(u)) {
    return true
  }

  return false
}

function filterVerbs(type: VerbType | 'all', level: VerbLevel | 'all'): Verb[] {
  return verbs.filter((v) => {
    const matchType = type === 'all' || v.type === type
    const matchLevel = level === 'all' || v.level === level
    return matchType && matchLevel
  })
}

function setupGame(
  newMode: GameMode,
  count: number | 'all',
  type: VerbType | 'all' = 'all',
  level: VerbLevel | 'all' = 'all'
) {
  mode.value = newMode
  selectedType.value = type
  selectedLevel.value = level

  const pool = filterVerbs(type, level)
  const available = pool.length > 0 ? pool : verbs
  const limit = count === 'all' ? available.length : Math.min(Math.max(1, count), available.length)

  verbCount.value = limit
  selectedVerbs.value = shuffle(available).slice(0, limit)
  currentIndex.value = 0
  results.value = []
  isFinished.value = false
  streak.value = 0
  maxStreak.value = 0
  sessionStartTime.value = Date.now()
  sessionDuration.value = 0
}

function retryMistakes() {
  const failed = results.value.filter((r) => !r.correct).map((r) => r.verb)
  if (failed.length === 0) return

  selectedVerbs.value = shuffle(failed)
  verbCount.value = selectedVerbs.value.length
  currentIndex.value = 0
  results.value = []
  isFinished.value = false
  streak.value = 0
  maxStreak.value = 0
  sessionStartTime.value = Date.now()
}

const currentVerb = computed<Verb | null>(() => selectedVerbs.value[currentIndex.value] ?? null)

function recordResult(result: GameResult) {
  results.value.push(result)

  if (result.correct) {
    streak.value++
    if (streak.value > maxStreak.value) {
      maxStreak.value = streak.value
    }
  } else {
    streak.value = 0
  }

  if (currentIndex.value < selectedVerbs.value.length - 1) {
    currentIndex.value++
  } else {
    sessionDuration.value = Math.round((Date.now() - sessionStartTime.value) / 1000)
    isFinished.value = true
  }
}

function submitAnswers(answers: Record<TenseKey, string>) {
  const verb = currentVerb.value
  if (!verb) return

  const trimmed: Record<TenseKey, string> = {
    base: answers.base?.trim() ?? '',
    past: answers.past?.trim() ?? '',
    participle: answers.participle?.trim() ?? '',
  }

  const correct =
    normalizedCompare(trimmed.base, verb.base) &&
    normalizedCompare(trimmed.past, verb.past) &&
    normalizedCompare(trimmed.participle, verb.participle)

  recordResult({ verb, correct, userAnswers: trimmed })
}

const score = computed<number>(() => results.value.filter((r) => r.correct).length)
const accuracy = computed<number>(() => {
  if (results.value.length === 0) return 0
  return Math.round((score.value / results.value.length) * 100)
})

function resetGame() {
  mode.value = 'write-all'
  verbCount.value = 10
  selectedVerbs.value = []
  currentIndex.value = 0
  results.value = []
  isFinished.value = false
  streak.value = 0
  maxStreak.value = 0
  sessionDuration.value = 0
}

function shuffleCards(verbsToShuffle: Verb[]): Card[] {
  const cards: Card[] = []
  const tenses: TenseKey[] = ['base', 'past', 'participle']

  for (const verb of verbsToShuffle) {
    cards.push({
      id: `${verb.base}-spanish-${Math.random().toString(36).substring(2, 7)}`,
      verb,
      tense: 'spanish',
      label: verb.spanish,
      matched: false,
    })

    for (const tense of tenses) {
      cards.push({
        id: `${verb.base}-${tense}-${Math.random().toString(36).substring(2, 7)}`,
        verb,
        tense,
        label: verb[tense],
        matched: false,
      })
    }
  }

  return shuffle(cards)
}

export function useVerbGame() {
  return {
    mode,
    verbCount,
    selectedType,
    selectedLevel,
    selectedVerbs,
    currentIndex,
    results,
    isFinished,
    streak,
    maxStreak,
    sessionDuration,
    currentVerb,
    score,
    accuracy,
    setupGame,
    retryMistakes,
    submitAnswers,
    recordResult,
    resetGame,
    shuffleCards,
    filterVerbs,
    normalizedCompare,
  }
}
