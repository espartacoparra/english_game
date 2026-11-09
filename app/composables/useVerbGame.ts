import { computed } from 'vue'
import { verbs } from '~/data/verbs'
import { useStats } from '~/composables/useStats'
import {
  applyResult,
  createCustomSession,
  createSession,
  filterVerbs as filterVerbPool,
  gradeAnswers,
  normalizedCompare,
  resetSession,
  retrySession,
  sessionAccuracy,
  sessionScore,
  shuffle,
  type GameSessionState,
} from '~/core/game-core'
import type { GameMode, GameResult, TenseKey, Verb, VerbLevel, VerbType } from '~/types/verb'

export interface Card {
  id: string
  verb: Verb
  tense: TenseKey | 'spanish'
  label: string
  matched: boolean
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

/**
 * Game session state for the browser.
 *
 * The rules live in `app/core/game-core.ts`; this composable only adapts them to
 * reactive Nuxt state. Every ref comes from `useState`, so the state is scoped to
 * one Nuxt app on the client and to one request on the server.
 */
export function useVerbGame() {
  const mode = useState<GameMode>('verbgame:mode', () => 'write-all')
  const verbCount = useState<number>('verbgame:verbCount', () => 10)
  const selectedType = useState<VerbType | 'all'>('verbgame:selectedType', () => 'all')
  const selectedLevel = useState<VerbLevel | 'all'>('verbgame:selectedLevel', () => 'all')
  const selectedVerbs = useState<Verb[]>('verbgame:selectedVerbs', () => [])
  const currentIndex = useState<number>('verbgame:currentIndex', () => 0)
  const results = useState<GameResult[]>('verbgame:results', () => [])
  const isFinished = useState<boolean>('verbgame:isFinished', () => false)

  const streak = useState<number>('verbgame:streak', () => 0)
  const maxStreak = useState<number>('verbgame:maxStreak', () => 0)
  const sessionStartTime = useState<number>('verbgame:sessionStartTime', () => 0)
  const sessionDuration = useState<number>('verbgame:sessionDuration', () => 0)

  const { recordAnswer } = useStats()

  function snapshot(): GameSessionState {
    return {
      mode: mode.value,
      verbCount: verbCount.value,
      selectedType: selectedType.value,
      selectedLevel: selectedLevel.value,
      selectedVerbs: selectedVerbs.value,
      currentIndex: currentIndex.value,
      results: results.value,
      isFinished: isFinished.value,
      streak: streak.value,
      maxStreak: maxStreak.value,
      sessionStartTime: sessionStartTime.value,
      sessionDuration: sessionDuration.value,
    }
  }

  function applyState(next: GameSessionState) {
    mode.value = next.mode
    verbCount.value = next.verbCount
    selectedType.value = next.selectedType
    selectedLevel.value = next.selectedLevel
    selectedVerbs.value = next.selectedVerbs
    currentIndex.value = next.currentIndex
    results.value = next.results
    isFinished.value = next.isFinished
    streak.value = next.streak
    maxStreak.value = next.maxStreak
    sessionStartTime.value = next.sessionStartTime
    sessionDuration.value = next.sessionDuration
  }

  function filterVerbs(type: VerbType | 'all', level: VerbLevel | 'all'): Verb[] {
    return filterVerbPool(verbs, type, level)
  }

  function setupGame(
    newMode: GameMode,
    count: number | 'all',
    type: VerbType | 'all' = 'all',
    level: VerbLevel | 'all' = 'all'
  ) {
    applyState(createSession(verbs, { mode: newMode, count, type, level }, Date.now()))
  }

  function setupCustomVerbsGame(customVerbs: Verb[], newMode: GameMode = 'write-all') {
    if (customVerbs.length === 0) return
    applyState(createCustomSession(customVerbs, newMode, Date.now()))
  }

  function retryMistakes() {
    const current = snapshot()
    const next = retrySession(current, Date.now())
    if (next !== current) applyState(next)
  }

  function recordResult(result: GameResult) {
    recordAnswer(result.verb, result.correct)
    applyState(applyResult(snapshot(), result, Date.now()))
  }

  function submitAnswers(answers: Record<TenseKey, string>) {
    const verb = currentVerb.value
    if (!verb) return

    const graded = gradeAnswers(verb, answers)
    recordResult({ verb, correct: graded.correct, userAnswers: graded.answers })
  }

  function resetGame() {
    applyState(resetSession(snapshot()))
  }

  const currentVerb = computed<Verb | null>(() => selectedVerbs.value[currentIndex.value] ?? null)
  const score = computed<number>(() => sessionScore(snapshot()))
  const accuracy = computed<number>(() => sessionAccuracy(snapshot()))

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
    setupCustomVerbsGame,
    retryMistakes,
    submitAnswers,
    recordResult,
    resetGame,
    shuffleCards,
    filterVerbs,
    normalizedCompare,
  }
}
