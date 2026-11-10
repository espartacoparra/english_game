import { describe, expect, it } from 'vitest'
import { isRoomRaceNotice, roomConnectionFailureMessage } from '../app/core/room-client'

/**
 * The room link is served by its own Worker, so a failed dial in development is
 * almost always a missing `dev:room`. The message has to name the address it
 * tried and the command that fixes it, otherwise the player only sees
 * "connection lost" and the fix stays invisible.
 */
describe('roomConnectionFailureMessage', () => {
  it('names the address that failed and the commands that start the room Worker', () => {
    const message = roomConnectionFailureMessage('ws://127.0.0.1:8787/ws?code=ABC123')

    expect(message).toContain('ws://127.0.0.1:8787/ws?code=ABC123')
    expect(message).toContain('bun run dev:room')
    expect(message).toContain('bun run dev:all')
  })

  it('falls back to the generic message when no address was recorded', () => {
    expect(roomConnectionFailureMessage('')).toBe('Se perdió la conexión con la sala')
    expect(roomConnectionFailureMessage('   ')).toBe('Se perdió la conexión con la sala')
  })
})

/**
 * A player who answers correctly but second loses a race, not a turn. Those
 * codes have to be told apart from real mistakes, because the room page shows a
 * mistake as a red banner and a lost race as a neutral notice.
 */
describe('isRoomRaceNotice', () => {
  it('treats a reply overtaken by the round, the game or the turn as a race', () => {
    expect(isRoomRaceNotice('stale_round')).toBe(true)
    expect(isRoomRaceNotice('not_playing')).toBe(true)
    expect(isRoomRaceNotice('not_your_turn')).toBe(true)
  })

  it('keeps the codes a player can actually cause as real errors', () => {
    expect(isRoomRaceNotice('invalid_reply')).toBe(false)
    expect(isRoomRaceNotice('already_answered')).toBe(false)
    expect(isRoomRaceNotice('room_full')).toBe(false)
    expect(isRoomRaceNotice('')).toBe(false)
  })
})
