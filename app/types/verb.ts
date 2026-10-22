export type TenseKey = 'base' | 'past' | 'participle'

export type VerbType = 'regular' | 'irregular'
export type VerbLevel = 'A1' | 'A2' | 'B1' | 'B2'

export interface Verb {
  spanish: string
  base: string
  past: string
  participle: string
  type: VerbType
  level: VerbLevel
}

export type GameMode = 'write-all' | 'fill-missing' | 'card-matching'

export interface GameResult {
  verb: Verb
  correct: boolean
  userAnswers: Record<TenseKey, string>
  timeSpentMs?: number
}

export interface VerbStat {
  verbBase: string
  attempts: number
  correct: number
  incorrect: number
  streak: number
  bestStreak: number
  lastSeenAt: number
}

export type VerbMasteryStatus = 'mastered' | 'learning' | 'unseen'

export interface VerbProgress {
  verb: Verb
  stat: VerbStat | null
  status: VerbMasteryStatus
  accuracy: number
}

export interface StatsSummary {
  totalAttempts: number
  totalCorrect: number
  totalIncorrect: number
  accuracy: number
  masteredCount: number
  learningCount: number
  unseenCount: number
  totalVerbs: number
  bestStreak: number
}
