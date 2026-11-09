import { filterVerbs, shuffle, type Rng } from '../../../../app/core/game-core'
import type {
  BoardCard,
  BoardRoundPrompt,
  BoardStep,
  RoundReply,
} from '../../../../app/core/room-protocol'
import { verbs } from '../../../../app/data/verbs'
import type { Verb } from '../../../../app/types/verb'
import type { ModeGrade, ModeRound, ModeSetup, ModeSpec } from './spec'

/**
 * The `board` family: card-matching on one shared board with alternating turns.
 *
 * A round deals four chains of four cards each, Spanish first, and shows all
 * sixteen. The player on turn picks the next form of the chain in play: the
 * first pick of a chain is its Spanish card, so that pick chooses the chain.
 * A correct pick keeps the turn and advances the chain; a wrong pick earns
 * nothing and passes the turn, leaving the chain where it was.
 */

/** The order of a chain, the same one `CardMatching.vue` walks. */
export const CHAIN_ORDER: BoardStep[] = ['spanish', 'base', 'past', 'participle']

/** Chains per round: four verbs, sixteen cards, all of them visible. */
export const CHAINS_PER_ROUND = 4

/** What a correct pick pays; the participle closes the chain and pays double. */
export const STEP_POINTS: Record<BoardStep, number> = {
  spanish: 1,
  base: 1,
  past: 1,
  participle: 2,
}

interface BoardChain {
  verb: Verb
  /** True once the participle was picked: the chain is no longer playable. */
  complete: boolean
}

/** A dealt card: the public `BoardCard` plus the grouping it must never show. */
interface DealtCard extends BoardCard {
  chain: number
  step: BoardStep
}

interface BoardSecret {
  chains: BoardChain[]
  /** Every card in board order; `id` is positional, never derived from content. */
  cards: DealtCard[]
  /** Ids of the players still playing, in join order: the turn rotation. */
  rotation: string[]
  /** Index into `rotation` of the player on turn. */
  turn: number
  /** Chain in play, or -1 when the next pick opens one. */
  current: number
  /** Steps picked in the chain in play: `CHAIN_ORDER[progress]` is next. */
  progress: number
  completed: number
  chainsBy: Record<string, number>
}

function turnPlayerOf(secret: BoardSecret): string {
  return secret.rotation[secret.turn] ?? ''
}

function neededStepOf(secret: BoardSecret): BoardStep {
  return CHAIN_ORDER[secret.progress] ?? 'spanish'
}

/** The label a step shows for a verb. */
function formOf(verb: Verb, step: BoardStep): string {
  return step === 'spanish' ? verb.spanish : verb[step]
}

/**
 * What every client sees of the board.
 *
 * It carries the turn, the step and the tally and nothing else: the grouping of
 * a card is never public, players find it by reading the cards.
 */
function boardPromptOf(secret: BoardSecret): BoardRoundPrompt {
  return {
    kind: 'board',
    cards: secret.cards.map((card) => ({ id: card.id, label: card.label })),
    needed: neededStepOf(secret),
    turnPlayerId: turnPlayerOf(secret),
    completedChains: secret.completed,
    totalChains: secret.chains.length,
    chainsBy: { ...secret.chainsBy },
  }
}

/** The readable solution: each chain with its four forms, in chain order. */
function solutionOf(chains: BoardChain[]): string {
  return chains
    .map(({ verb }) => {
      const forms = CHAIN_ORDER.map((step) => formOf(verb, step))
      return `${forms[0]} → ${forms.slice(1).join(' / ')}`
    })
    .join('\n')
}

/**
 * Four verbs for one board.
 *
 * A narrow type/level start can leave fewer than four verbs, so the deal
 * repeats the pool only then: with four verbs or more a round always has four
 * different chains.
 */
function dealChains(pool: Verb[], rng: Rng): Verb[] {
  const chains = shuffle(pool, rng).slice(0, CHAINS_PER_ROUND)
  for (let index = 0; chains.length < CHAINS_PER_ROUND && pool.length > 0; index += 1) {
    chains.push(pool[index % pool.length]!)
  }
  return chains
}

/** Rounds in the session: `count`, or one round per board the pool can deal. */
function roundCount(setup: ModeSetup, available: number): number {
  if (setup.count === 'all') return Math.max(1, Math.floor(available / CHAINS_PER_ROUND))
  const requested = Number.isFinite(setup.count) ? Math.floor(setup.count) : 10
  return Math.max(1, requested)
}

function createBoard(setup: ModeSetup, index: number, chainVerbs: Verb[], rng: Rng): ModeRound {
  const chains: BoardChain[] = chainVerbs.map((verb) => ({ verb, complete: false }))
  const dealt: DealtCard[] = chains.flatMap((chain, chainIndex) =>
    CHAIN_ORDER.map((step) => ({
      id: '',
      label: formOf(chain.verb, step),
      chain: chainIndex,
      step,
    }))
  )
  // The cards are shuffled and the ids are positional, so a card id says where
  // the card landed and nothing about its verb or its place in a chain.
  const cards: DealtCard[] = shuffle(dealt, rng).map((card, position) => ({
    ...card,
    id: `c${position + 1}`,
  }))

  const rotation = [...new Set(setup.players.filter((id) => id !== ''))]
  const secret: BoardSecret = {
    chains,
    cards,
    rotation,
    // The opening player rotates with the round so everybody opens one; the
    // order inside the round stays the join order.
    turn: rotation.length > 0 ? index % rotation.length : 0,
    current: -1,
    progress: 0,
    completed: 0,
    chainsBy: Object.fromEntries(rotation.map((id) => [id, 0])),
  }

  return { prompt: boardPromptOf(secret), answer: solutionOf(chains), secret }
}

function createRounds(setup: ModeSetup, rng: Rng): ModeRound[] {
  const filtered = filterVerbs(verbs, setup.type, setup.level)
  const available = filtered.length > 0 ? filtered : verbs
  const limit = roundCount(setup, available.length)
  return Array.from({ length: limit }, (_, index) =>
    createBoard(setup, index, dealChains(available, rng), rng)
  )
}

/**
 * Whether this card is one the player on turn was asked for.
 *
 * The wire contract gives a `BoardCard` no step, and duplicate labels are
 * routine (a regular verb's past and participle are the same word, and two
 * verbs can share a form), so every pick after the opening one is graded on the
 * label the card shows: any card showing the next form is the right card.
 */
function accepted(secret: BoardSecret, card: DealtCard): boolean {
  if (secret.progress === 0) {
    // Opening a chain: the Spanish card of any chain nobody closed yet.
    return card.step === 'spanish' && secret.chains[card.chain]?.complete === false
  }
  const chain = secret.chains[secret.current]
  return Boolean(chain) && card.label === formOf(chain!.verb, neededStepOf(secret))
}

/** Hands the turn to the next player in the rotation. */
function passTurn(secret: BoardSecret): BoardSecret {
  if (secret.rotation.length === 0) return secret
  return { ...secret, turn: (secret.turn + 1) % secret.rotation.length }
}

/** The player with the most chains, or null when nobody closed one or two are tied. */
function winnerOf(secret: BoardSecret): string | null {
  const best = Math.max(0, ...Object.values(secret.chainsBy))
  const leaders = Object.entries(secret.chainsBy).filter(([, chains]) => chains === best)
  return best > 0 && leaders.length === 1 ? leaders[0]![0] : null
}

/** Closes the chain in play, crediting the player who picked the participle. */
function closeChain(secret: BoardSecret, playerId: string): BoardSecret {
  return {
    ...secret,
    chains: secret.chains.map((chain, index) =>
      index === secret.current ? { ...chain, complete: true } : chain
    ),
    chainsBy: {
      ...secret.chainsBy,
      [playerId]: (secret.chainsBy[playerId] ?? 0) + 1,
    },
    completed: secret.completed + 1,
    // The next pick opens another chain, so the board never sits without one.
    current: -1,
    progress: 0,
  }
}

function gradeBoard(round: ModeRound, reply: RoundReply, playerId: string): ModeGrade {
  if (reply.kind !== 'board') return { correct: false, points: 0, detail: null }
  const secret = round.secret as BoardSecret
  // Only the player on turn picks: a stray pick is refused instead of spending
  // the turn of the player it belongs to, and it changes nothing.
  if (turnPlayerOf(secret) !== playerId) {
    return { correct: false, points: 0, detail: null, rejected: 'not_your_turn' }
  }

  const card = secret.cards.find((entry) => entry.id === reply.cardId)
  const detail = card?.label ?? null
  if (!card || !accepted(secret, card)) {
    // A wrong pick earns nothing and passes the turn; the chain stays in play.
    return { correct: false, points: 0, detail, nextSecret: passTurn(secret) }
  }

  const points = STEP_POINTS[neededStepOf(secret)]
  if (secret.progress === 0) {
    // The Spanish card chosen here is the chain the next picks work on.
    return {
      correct: true,
      points,
      detail,
      nextSecret: { ...secret, current: card.chain, progress: 1 },
    }
  }
  if (secret.progress < CHAIN_ORDER.length - 1) {
    return {
      correct: true,
      points,
      detail,
      nextSecret: { ...secret, progress: secret.progress + 1 },
    }
  }

  const closed = closeChain(secret, playerId)
  const boardDone = closed.completed >= closed.chains.length
  return boardDone
    ? {
        correct: true,
        points,
        detail,
        nextSecret: closed,
        closesRound: { winnerId: winnerOf(closed) },
      }
    : { correct: true, points, detail, nextSecret: closed }
}

function playerLeft(round: ModeRound, playerId: string): ModeRound | null {
  const secret = round.secret as BoardSecret
  const at = secret.rotation.indexOf(playerId)
  // The last player stays in the rotation: a board always names someone on
  // turn, and without them nobody is left to stall.
  if (at < 0 || secret.rotation.length <= 1) return null

  const rotation = secret.rotation.filter((id) => id !== playerId)
  // Leaving on your turn hands it to the next player; leaving before them
  // shifts the index so the player on turn keeps the turn.
  let turn = at < secret.turn ? secret.turn - 1 : secret.turn
  if (turn >= rotation.length) turn = 0

  const next: BoardSecret = { ...secret, rotation, turn }
  return { ...round, prompt: boardPromptOf(next), secret: next }
}

export const cardMatching: ModeSpec = {
  mode: 'card-matching',
  family: 'board',
  close: { kind: 'board-complete' },
  createRounds,
  publicPrompt: (round) => boardPromptOf(round.secret as BoardSecret),
  grade: gradeBoard,
  playerLeft,
}
