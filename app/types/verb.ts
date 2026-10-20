export type TenseKey = 'base' | 'past' | 'participle'

export interface Verb {
  spanish: string
  base: string
  past: string
  participle: string
}

export type GameMode = 'write-all' | 'fill-missing' | 'card-matching'

export interface GameResult {
  verb: Verb
  correct: boolean
  userAnswers: Record<TenseKey, string>
}
