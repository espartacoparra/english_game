import type { Rng } from '../../../../app/core/game-core'
import type {
  RoomMode,
  RoundFamily,
  RoundPrompt,
  RoundReply,
} from '../../../../app/core/room-protocol'
import type { VerbLevel, VerbType } from '../../../../app/types/verb'

/**
 * What a mode needs to build its rounds.
 *
 * It is the start options already resolved, so a mode never reads room state
 * and never sees another mode's data: each one owns its own item pool.
 */
export interface ModeSetup {
  count: number | 'all'
  type: VerbType | 'all'
  level: VerbLevel | 'all'
  /** Player ids in join order at start: the turn order of a turn-based mode. */
  players: string[]
}

/**
 * One round of a mode.
 *
 * The three fields have different audiences:
 *
 * - `prompt` is public: it goes to every client and must not contain answers.
 * - `answer` is public only after the round closes: the readable solution.
 * - `secret` never leaves the server: everything `grade` needs.
 */
export interface ModeRound {
  prompt: RoundPrompt
  answer: string
  secret: unknown
}

export interface ModeGrade {
  correct: boolean
  /** Points this reply earned, so a mode with partial credit can award more. */
  points: number
  /** What the player submitted, normalised for display. Never the answer. */
  detail: string | null
  /** A reply the mode refuses, such as a pick out of turn: the machine reports it and stores nothing. */
  rejected?: 'not_your_turn'
  /** The mode's state after this reply, so a board can advance between picks. */
  nextSecret?: unknown
  /** Set when the mode decides its own round is over, with the winner it computed. */
  closesRound?: { winnerId: string | null }
}

/**
 * When a round stops taking replies.
 *
 * The machine owns this timing; the mode only declares which rule it plays by.
 */
export type RoundCloseRule =
  /** The first correct reply closes the round while others may still be typing. */
  | { kind: 'first-correct' }
  /** The round closes once every player has replied. */
  | { kind: 'all-answered' }
  /** The round closes when the mode reports it, so one player may reply many times. */
  | { kind: 'board-complete' }

/**
 * How long a round stays open before the room closes it on time, per family.
 *
 * One table, read by the machine and by nobody else: a mode declares its family
 * and never its own timing. The values are size, not speed: the deadline is the
 * escape hatch for a player who is idle or away, so it is generous enough that
 * a player who is thinking never loses a round to it.
 */
export const ROUND_DEADLINE_MS: Record<RoundFamily, number> = {
  /** Three typed forms: conjugating takes the longest of the short rounds. */
  tenses: 45_000,
  /** One pick out of four labels: the shortest thing anybody can be asked. */
  choice: 20_000,
  /** A free list: several items to recall and type, not one word. */
  list: 60_000,
  /** Sixteen cards, one pick per turn: the longest round in the game. */
  board: 90_000,
}

/** The deadline of a family, in milliseconds from the moment the round opens. */
export function roundDeadlineMs(family: RoundFamily): number {
  return ROUND_DEADLINE_MS[family]
}

/**
 * One game mode as the room machine sees it.
 *
 * The machine is mode-agnostic: it builds rounds through `createRounds`, grades
 * through `grade` and closes through `close`. Adding a mode means adding a spec
 * to the registry in `registry.ts`; `machine.ts` does not change.
 */
export interface ModeSpec {
  readonly mode: RoomMode
  /** Must equal the `kind` of both the prompt and the reply this mode swaps. */
  readonly family: RoundFamily
  readonly close: RoundCloseRule
  /** Builds every round of a session from the mode's own item pool. */
  createRounds(setup: ModeSetup, rng: Rng): ModeRound[]
  /** Optional live public prompt for a board that changes after every reply. */
  publicPrompt?(round: ModeRound): RoundPrompt
  /** Pure: `round.secret` is private, `reply` came from the client, `playerId` is the one it came from. */
  grade(round: ModeRound, reply: RoundReply, playerId: string): ModeGrade
  /** Optional: a player dropped mid-round, so a rotation can skip them; null keeps the round. */
  playerLeft?(round: ModeRound, playerId: string): ModeRound | null
  /**
   * Optional: the player ids this round still waits for, in no particular order.
   *
   * The machine uses it instead of the room's whole player list to close an
   * `all-answered` round, so a player who left mid-round stops being awaited
   * while the room keeps their slot. Returning an empty list is never allowed: a
   * round always waits for somebody, and a round that waits for nobody would
   * freeze the room for good.
   */
  activePlayers?(round: ModeRound): string[]
}
