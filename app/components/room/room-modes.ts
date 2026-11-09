import type { RoomMode } from '~/core/room-client'

/**
 * The seven game modes a room can play, in one place.
 *
 * `app/core/room-protocol.ts` owns the `RoomMode` union; this module only adds
 * the labels the browser shows, so the menu and the lobby never drift apart.
 */
export const ROOM_MODE_OPTIONS: readonly { id: RoomMode; label: string }[] = [
  { id: 'write-all', label: 'Escribir los 3 tiempos' },
  { id: 'fill-missing', label: 'Completar el tiempo faltante' },
  { id: 'card-matching', label: 'Emparejar tarjetas (por turnos)' },
  { id: 'synonyms', label: 'Sinónimos' },
  { id: 'antonyms', label: 'Antónimos' },
  { id: 'cognates', label: 'Cognados (opción múltiple)' },
  { id: 'false-cognates', label: 'Falsos cognados (opción múltiple)' },
]

/** A room with no explicit mode plays the original race. */
export const DEFAULT_ROOM_MODE: RoomMode = 'write-all'

export function isRoomMode(value: unknown): value is RoomMode {
  return (
    typeof value === 'string' &&
    ROOM_MODE_OPTIONS.some((option) => option.id === (value as RoomMode))
  )
}

export function roomModeLabel(mode: RoomMode | null | undefined): string {
  if (!mode) return ''
  return ROOM_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? mode
}
