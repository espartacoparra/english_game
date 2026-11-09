import { normalizedCompare, shuffle, type Rng } from '../../../../app/core/game-core'
import type { ListRoundPrompt, RoundReply } from '../../../../app/core/room-protocol'
import { ANTONYM_ITEMS, SYNONYM_ITEMS } from '../../../../app/data/practice'
import type { ModeGrade, ModeRound, ModeSetup, ModeSpec } from './spec'

/**
 * The `list` family: the player types every synonym (or antonym) of a word they
 * know, and each accepted item found pays one point.
 *
 * Both modes are the same rule over a different pool, so they share the round
 * builder and the grader and differ only in the items they deal.
 *
 * Neither is a race: a list has many right answers, so the round closes once
 * every player it still waits for replied, and the winner is the one with the
 * most items found.
 * The practice screens stay single-player and self-reported; only the room
 * grades them, and the room pays exactly what `SynonymsPractice.vue` pays: one
 * point per accepted item.
 */

/** One item of a pool, flattened to the shape both modes share. */
interface ListItem {
  word: string
  hint: string
  /** Every accepted answer. Never public before the round closes. */
  accepted: string[]
}

interface ListSecret {
  /** Every accepted item, compared through `normalizedCompare` exactly like a submission. */
  accepted: string[]
  /** Players the round still waits for, in join order. Never graded against. */
  players: string[]
}

/** The two pools, read once from the practice data both sides already share. */
const SYNONYM_POOL: ListItem[] = SYNONYM_ITEMS.map(({ word, hint, synonyms: list }) => ({
  word,
  hint,
  accepted: list,
}))

const ANTONYM_POOL: ListItem[] = ANTONYM_ITEMS.map(({ word, hint, antonyms: list }) => ({
  word,
  hint,
  accepted: list,
}))

/** A safe, finite round count: the pool always has at least one item. */
function roundLimit(setup: ModeSetup, available: number): number {
  if (setup.count === 'all') return available
  const requested = Number.isFinite(setup.count) ? Math.floor(setup.count) : 10
  return Math.min(Math.max(1, requested), available)
}

/** The player ids a round waits for, in join order and without repeats. */
function rosterOf(setup: ModeSetup): string[] {
  return [...new Set(setup.players.filter((id) => id !== ''))]
}

function createRound(item: ListItem, players: string[]): ModeRound {
  // The pool lists are read-only module data, so the round copies them: no
  // round can edit the pool another room is about to deal.
  const accepted = [...item.accepted]
  const secret: ListSecret = { accepted, players }
  const prompt: ListRoundPrompt = {
    kind: 'list',
    word: item.word,
    hint: item.hint,
    // How many answers exist, never which ones.
    expectedCount: accepted.length,
  }
  return { prompt, answer: accepted.join(', '), secret }
}

/**
 * The mode's own item pool, dealt by the injected `rng`.
 *
 * The practice items carry no verb type or level, so `type` and `level` filter
 * nothing here and the whole pool stays eligible; that is the same rule the
 * other modes follow when a filter matches nothing. A list has no options to
 * order either, so `shuffle` is the only randomness of the mode.
 */
function listRounds(pool: ListItem[]) {
  return (setup: ModeSetup, rng: Rng): ModeRound[] => {
    const players = rosterOf(setup)
    const limit = roundLimit(setup, pool.length)
    // One deal per room: an item never repeats inside a session.
    return shuffle(pool, rng)
      .slice(0, limit)
      .map((item) => createRound(item, players))
  }
}

/**
 * What the player typed, one entry per distinct word.
 *
 * Blanks are dropped and so are repeats, so a reply cannot pay twice for the
 * same word or for the same word in different case. Untrusted shapes are
 * dropped instead of thrown on.
 */
function submittedKeys(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  const keys = new Set<string>()
  for (const entry of items) {
    if (typeof entry !== 'string') continue
    const key = entry.trim().toLowerCase()
    if (key !== '') keys.add(key)
  }
  return [...keys]
}

/**
 * One point per accepted item found, each of them at most once.
 *
 * The accepted list is the loop, so two spellings of the same answer are one
 * find and a word nobody listed scores nothing. `correct` is "found something"
 * rather than "found everything": a partial list is a real result in this mode,
 * which is why `points` carries the partial credit.
 */
function gradeList(round: ModeRound, reply: RoundReply): ModeGrade {
  if (reply.kind !== 'list') return { correct: false, points: 0, detail: null }

  const { accepted } = round.secret as ListSecret
  const submitted = submittedKeys(reply.items)
  const matches = accepted.filter((item) =>
    submitted.some((value) => normalizedCompare(value, item))
  ).length

  return {
    correct: matches > 0,
    points: matches,
    detail: `${matches}/${accepted.length}`,
  }
}

/**
 * A player dropped mid-round.
 *
 * The round stops waiting for them and nothing else moves: the prompt has no
 * player in it, the solution stays the same and every other player scores
 * exactly what they scored before. The last player stays in the roster, because
 * a round always waits for somebody and without them nobody is left to stall.
 */
function playerLeft(round: ModeRound, playerId: string): ModeRound | null {
  const secret = round.secret as ListSecret
  if (secret.players.length <= 1 || !secret.players.includes(playerId)) return null

  const next: ListSecret = {
    ...secret,
    players: secret.players.filter((id) => id !== playerId),
  }
  return { ...round, secret: next }
}

/**
 * The players this round still waits for.
 *
 * It is the roster the secret already tracks, which is the same one
 * `playerLeft` shrinks, so a player who left mid-round is not awaited. It is
 * never empty: that is exactly why `playerLeft` keeps the last player.
 */
function activePlayers(round: ModeRound): string[] {
  return [...(round.secret as ListSecret).players]
}

export const synonyms: ModeSpec = {
  mode: 'synonyms',
  family: 'list',
  close: { kind: 'all-answered' },
  createRounds: listRounds(SYNONYM_POOL),
  grade: gradeList,
  playerLeft,
  activePlayers,
}

export const antonyms: ModeSpec = {
  mode: 'antonyms',
  family: 'list',
  close: { kind: 'all-answered' },
  createRounds: listRounds(ANTONYM_POOL),
  grade: gradeList,
  playerLeft,
  activePlayers,
}
