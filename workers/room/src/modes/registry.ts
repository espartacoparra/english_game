import type { RoomMode } from '../../../../app/core/room-protocol'
import { cardMatching } from './board'
import { cognates, falseCognates } from './quiz'
import type { ModeSpec } from './spec'
import { fillMissing, writeAll } from './tenses'
import { antonyms, synonyms } from './words'

/**
 * Every mode the room server can play today.
 *
 * Later tasks add their spec here and nothing in `machine.ts` moves. The frozen
 * contract defines seven modes, so a mode that is not in this map is rejected
 * with `unsupported_mode` instead of being silently downgraded.
 */
const MODES: Partial<Record<RoomMode, ModeSpec>> = {
  'write-all': writeAll,
  'fill-missing': fillMissing,
  'card-matching': cardMatching,
  synonyms,
  antonyms,
  cognates,
  'false-cognates': falseCognates,
}

export const DEFAULT_MODE: RoomMode = 'write-all'

export const SUPPORTED_MODES = Object.keys(MODES) as RoomMode[]

export function modeSpec(mode: RoomMode): ModeSpec | null {
  return MODES[mode] ?? null
}
