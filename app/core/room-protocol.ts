import type { GameMode, TenseKey, VerbLevel, VerbType } from '../types/verb'

/**
 * Frozen wire contract for the room feature.
 *
 * Both sides import this file and nothing else defines these shapes:
 * the browser (`app/core/room-client.ts`) and the authoritative machine
 * (`workers/room/src/machine.ts`). Changing a type here changes the protocol.
 *
 * The four families exist because the seven game modes do not share one shape:
 *
 * - `tenses`  write-all, fill-missing  (typed conjugation)
 * - `choice`  cognates, false-cognates (multiple choice, objective grading)
 * - `list`    synonyms, antonyms       (free list, partial credit)
 * - `board`   card-matching            (shared board, alternating turns)
 */

/** A room is playable from the second player and takes no more than eight. */
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 8

export type RoomMode = GameMode

export type RoundFamily = 'tenses' | 'choice' | 'list' | 'board'

export type RoomPhase = 'lobby' | 'playing' | 'finished'

export interface RoomPlayerInfo {
  id: string
  name: string
}

/* ------------------------------------------------------------------ prompts */

/** One form of a verb, identified only by an opaque round-local id. */
export type BoardStep = 'spanish' | TenseKey

export interface BoardCard {
  /** Opaque and round-local. Never encodes the verb or the answer order. */
  id: string
  label: string
}

export interface TenseRoundPrompt {
  kind: 'tenses'
  spanish: string
  type: VerbType
  level: VerbLevel
  /** fill-missing reveals one form; write-all reveals none. */
  givenTense: TenseKey | null
  givenForm: string | null
}

export interface ChoiceOption {
  id: string
  label: string
}

export interface ChoiceRoundPrompt {
  kind: 'choice'
  /** The card or word the question is about. */
  item: string
  question: string
  hint: string | null
  options: ChoiceOption[]
}

export interface ListRoundPrompt {
  kind: 'list'
  word: string
  hint: string
  /** How many accepted items exist. Never which ones. */
  expectedCount: number
}

export interface BoardRoundPrompt {
  kind: 'board'
  /** Every card, always visible: that is the premise of this mode. */
  cards: BoardCard[]
  /** The step the player on turn must pick next. */
  needed: BoardStep
  turnPlayerId: string
  completedChains: number
  totalChains: number
  /** Chains completed by each player. */
  chainsBy: Record<string, number>
}

export type RoundPrompt =
  | TenseRoundPrompt
  | ChoiceRoundPrompt
  | ListRoundPrompt
  | BoardRoundPrompt

/* ------------------------------------------------------------------ replies */

export type RoundReply =
  | { kind: 'tenses'; answers: Partial<Record<TenseKey, string>> }
  | { kind: 'choice'; optionId: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'board'; cardId: string }

/* ------------------------------------------------------------------- events */

export interface PublicRoom {
  code: string
  phase: RoomPhase
  mode: RoomMode
  /** First player to join; only the host may start the game. */
  hostId: string | null
  players: RoomPlayerInfo[]
  scores: Record<string, number>
  roundIndex: number | null
  totalRounds: number | null
  prompt: RoundPrompt | null
}

export interface RoundProgressEntry {
  playerId: string
  correct: boolean
  /** Points this player earned in the round, partial credit included. */
  points: number
}

export interface RoundOutcome {
  playerId: string
  correct: boolean
  points: number
  /** Normalised for display only: what the player submitted. */
  detail: string | null
}

export interface FinishedPayload {
  scores: Record<string, number>
  players: RoomPlayerInfo[]
}

export type RoomServerEvent =
  | { t: 'state'; room: PublicRoom }
  | { t: 'round'; index: number; total: number; prompt: RoundPrompt }
  | { t: 'progress'; index: number; answered: RoundProgressEntry[] }
  | {
      t: 'result'
      index: number
      /** Player who closed the round, or null when nobody earned it. */
      winnerId: string | null
      prompt: RoundPrompt
      outcomes: RoundOutcome[]
      /** Readable solution, shown once the round is over. */
      solution: string | null
    }
  | ({ t: 'finished' } & FinishedPayload)
  | { t: 'error'; code: string; message: string }

export type StartOptions = {
  mode?: RoomMode
  count?: number | 'all'
  type?: VerbType | 'all'
  level?: VerbLevel | 'all'
}

export type RoomClientMessage =
  | { t: 'join'; playerId: string; name: string }
  | ({ t: 'start' } & StartOptions)
  | { t: 'answer'; index: number; reply: RoundReply }
