import { computed, ref } from 'vue'
import { verbs } from '~/data/verbs'
import type { GameMode, GameResult, TenseKey, Verb } from '~/types/verb'

export interface Card {
  id: string
  verb: Verb
  tense: TenseKey | 'spanish'
  label: string
  matched: boolean
}

const mode = ref<GameMode>('write-all')
const verbCount = ref<number>(10)
const selectedVerbs = ref<Verb[]>([])
const currentIndex = ref<number>(0)
const results = ref<GameResult[]>([])
const isFinished = ref<boolean>(false)

function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function normalizedCompare(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function setupGame(newMode: GameMode, count: number) {
  mode.value = newMode
  verbCount.value = Math.min(Math.max(1, count), verbs.length)
  selectedVerbs.value = shuffle(verbs).slice(0, verbCount.value)
  currentIndex.value = 0
  results.value = []
  isFinished.value = false
}

const currentVerb = computed<Verb | null>(() => selectedVerbs.value[currentIndex.value] ?? null)

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

  results.value.push({ verb, correct, userAnswers: trimmed })

  if (currentIndex.value < selectedVerbs.value.length - 1) {
    currentIndex.value++
  } else {
    isFinished.value = true
  }
}

const score = computed<number>(() => results.value.filter((r) => r.correct).length)

function resetGame() {
  mode.value = 'write-all'
  verbCount.value = 10
  selectedVerbs.value = []
  currentIndex.value = 0
  results.value = []
  isFinished.value = false
}

function shuffleCards(verbsToShuffle: Verb[]): Card[] {
  const cards: Card[] = []
  const tenses: TenseKey[] = ['base', 'past', 'participle']

  for (const verb of verbsToShuffle) {
    cards.push({
      id: `${verb.base}-spanish`,
      verb,
      tense: 'spanish',
      label: verb.spanish,
      matched: false,
    })

    for (const tense of tenses) {
      cards.push({
        id: `${verb.base}-${tense}`,
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
    selectedVerbs,
    currentIndex,
    results,
    isFinished,
    currentVerb,
    score,
    setupGame,
    submitAnswers,
    resetGame,
    shuffleCards,
    normalizedCompare,
  }
}
