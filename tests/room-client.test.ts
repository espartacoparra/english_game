import { describe, expect, it } from 'vitest'
import {
  isLoopbackSocketUrl,
  isRoomRaceNotice,
  resolveRoomWsUrl,
  roomConnectionFailureMessage,
  roomSocketUrl,
} from '../app/core/room-client'

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

  /**
   * A deployed room Worker cannot be started by the player and lives on the
   * other side of the network, so the dev command is noise there. The address
   * still has to appear: it is what separates "the Worker is down" from "the
   * app was built pointing at a dev machine".
   */
  it('drops the dev hint for a deployed room Worker but still names the address', () => {
    const url = 'wss://english-game-room.example.workers.dev/ws?code=ABC123'
    const message = roomConnectionFailureMessage(url)

    expect(message).toContain(url)
    expect(message).not.toContain('dev:room')
    expect(message).not.toContain('dev:all')
  })
})

/** The dial address is configuration, and a wrong one fails silently otherwise. */
describe('resolveRoomWsUrl', () => {
  it('uses the configured address verbatim, trailing slash included', () => {
    expect(resolveRoomWsUrl('wss://rooms.example.dev/', { protocol: 'https:', host: 'app.example.dev' })).toBe(
      'wss://rooms.example.dev/'
    )
  })

  it('falls back to the page origin with wss on an https page', () => {
    expect(resolveRoomWsUrl('', { protocol: 'https:', host: 'english-game.example.workers.dev' })).toBe(
      'wss://english-game.example.workers.dev'
    )
  })

  it('falls back to ws on a plain http page', () => {
    expect(resolveRoomWsUrl(undefined, { protocol: 'http:', host: 'localhost:3010' })).toBe(
      'ws://localhost:3010'
    )
  })

  it('yields no base address when there is neither config nor a location', () => {
    expect(resolveRoomWsUrl('', null)).toBe('')
    expect(resolveRoomWsUrl('  ')).toBe('')
  })

  it('builds the same-origin socket URL the transport dials', () => {
    const base = resolveRoomWsUrl('', { protocol: 'https:', host: 'rooms.example.dev' })

    expect(roomSocketUrl(base, 'abc123')).toBe('wss://rooms.example.dev/ws?code=ABC123')
  })
})

describe('isLoopbackSocketUrl', () => {
  it('recognizes the addresses that only exist on the dev machine', () => {
    expect(isLoopbackSocketUrl('ws://127.0.0.1:8787/ws?code=ABC123')).toBe(true)
    expect(isLoopbackSocketUrl('ws://localhost:8787/ws')).toBe(true)
    expect(isLoopbackSocketUrl('ws://[::1]:8787/ws')).toBe(true)
  })

  it('treats a deployed room Worker as remote', () => {
    expect(isLoopbackSocketUrl('wss://english-game-room.example.workers.dev/ws?code=ABC123')).toBe(
      false
    )
    expect(isLoopbackSocketUrl('')).toBe(false)
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
