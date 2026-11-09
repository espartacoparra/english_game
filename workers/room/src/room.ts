import type {
  RoomClientMessage,
  RoomServerEvent,
} from '../../../app/core/room-protocol'
import {
  createRoom,
  expireRound,
  handleMessage,
  leaveRoom,
  type RoomState,
} from './machine'

export interface Env {
  ROOMS: DurableObjectNamespace
}

interface Attachment {
  playerId: string
}

const ROOM_KEY = 'room'

/**
 * One Durable Object per room code.
 *
 * WebSockets use the Hibernation API, so an idle room costs no duration. All
 * mutations go through the pure machine in `machine.ts`; this class only owns
 * sockets, persistence, broadcasting and the round alarm, which also gives the
 * race a single serialized order of arrival.
 */
export class Room implements DurableObject {
  private readonly ctx: DurableObjectState
  private readonly env: Env
  private room: RoomState | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>(ROOM_KEY)) ?? null
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'expected_websocket' }, 426)
    }

    const code = new URL(request.url).searchParams.get('code') ?? ''
    if (!this.room) {
      this.room = createRoom(code, Date.now())
      await this.persist()
    }

    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    return new Response(null, {
      status: 101,
      webSocket: pair[0],
    } as ResponseInit & { webSocket: WebSocket })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let message: RoomClientMessage
    try {
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
      message = JSON.parse(text) as RoomClientMessage
    } catch {
      this.send(ws, { t: 'error', code: 'bad_json', message: 'Mensaje inválido' })
      return
    }

    if (!this.room) {
      this.send(ws, { t: 'error', code: 'no_room', message: 'Sala inexistente' })
      return
    }

    const playerId = attachmentOf(ws)?.playerId ?? null
    const result = handleMessage(this.room, playerId, message, Date.now())
    if (!result.ok) return this.send(ws, errorEvent(result.error))

    // The join travels without an identity, so the socket keeps it after the
    // machine accepted the name and the slot.
    if (message.t === 'join') {
      ws.serializeAttachment({ playerId: message.playerId } satisfies Attachment)
    }

    this.room = result.state
    await this.persist()
    this.broadcast(result.events)
    // A `start` opens a round and an `answer` that keeps it open leaves the same
    // deadline in place; either way the alarm now has to match the round in play.
    await this.syncAlarm()
  }

  /**
   * The Durable Object alarm closes the round that ran out of time.
   *
   * This is the only timer a hibernating room has: `setTimeout` dies with the
   * isolate, an alarm survives it. The state is read back from storage first, so
   * an alarm that fires for a round which already closed (a reply beat it, or a
   * second alarm was armed) finds nothing to expire and does nothing at all.
   */
  async alarm(): Promise<void> {
    this.room = (await this.ctx.storage.get<RoomState>(ROOM_KEY)) ?? this.room
    if (!this.room) return

    const result = expireRound(this.room, Date.now())
    if (!result.ok) return
    this.room = result.state
    if (result.events.length > 0) {
      await this.persist()
      this.broadcast(result.events)
    }
    // Expiry opened the next round of the session or finished the game, so the
    // alarm is either re-armed for the new deadline or cleared.
    await this.syncAlarm()
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason)
    } catch {
      // The socket may already be closed.
    }

    const playerId = attachmentOf(ws)?.playerId
    if (!playerId || !this.room) return

    // A socket that goes away leaves the lobby, which is also how the host
    // hands the room over. Mid-game the slot stays, so scores and the round
    // survive a reload.
    const result = leaveRoom(this.room, playerId)
    if (!result.ok || result.events.length === 0) return
    this.room = result.state
    await this.persist()
    this.broadcast(result.events)
    // A departure can empty the lobby, and an empty room must not keep a stale
    // alarm armed for a round nobody is in any more.
    await this.syncAlarm()
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'error')
    } catch {
      // The socket may already be closed.
    }
  }

  private async persist(): Promise<void> {
    if (this.room) await this.ctx.storage.put(ROOM_KEY, this.room)
  }

  /**
   * Arms the alarm for the deadline of the round in play, or clears it.
   *
   * Called when a round opens as well as after every message and every
   * departure, so it derives the deadline from the state the machine just
   * produced instead of tracking it: setting the same time twice is what the
   * storage API does anyway, and a room with nothing to close ends up with no
   * alarm at all.
   */
  private async syncAlarm(): Promise<void> {
    const deadline = this.openDeadline()
    if (deadline === null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(deadline)
  }

  /** The deadline of the round in play, or null when no round may close on time. */
  private openDeadline(): number | null {
    const room = this.room
    // A lobby never closes on time, a finished game has nothing left to close,
    // and an empty room must not keep a stale alarm.
    if (!room || room.phase !== 'playing' || room.players.length === 0) return null
    return room.round?.deadline ?? null
  }

  private broadcast(events: RoomServerEvent[]): void {
    const payload = JSON.stringify(events)
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload)
      } catch {
        // A dead socket must not stop the broadcast.
      }
    }
  }

  private send(ws: WebSocket, event: unknown): void {
    try {
      ws.send(JSON.stringify([event]))
    } catch {
      // The socket may already be closed.
    }
  }
}

function attachmentOf(ws: WebSocket): Attachment | null {
  try {
    return (ws.deserializeAttachment() as Attachment | null) ?? null
  } catch {
    return null
  }
}

function errorEvent(code: string): { t: 'error'; code: string; message: string } {
  return { t: 'error', code, message: errorMessage(code) }
}

function errorMessage(code: string): string {
  switch (code) {
    case 'room_full':
      return 'La sala ya tiene ocho jugadores'
    case 'below_min_players':
      return 'Hacen falta al menos dos jugadores'
    case 'not_host':
      return 'Solo el anfitrión puede empezar la partida'
    case 'unsupported_mode':
      return 'Ese modo todavía no está disponible en salas'
    case 'invalid_reply':
      return 'Respuesta inválida'
    case 'no_rounds':
      return 'No hay ítems para esos filtros'
    case 'game_in_progress':
      return 'La partida ya empezó'
    case 'already_started':
      return 'La partida ya empezó'
    case 'already_answered':
      return 'Ya contestaste este verbo'
    case 'not_your_turn':
      return 'Todavía no es tu turno'
    case 'stale_round':
      return 'La ronda ya avanzó'
    case 'not_playing':
      return 'La partida no está en curso'
    case 'not_in_room':
      return 'No estás en esta sala'
    case 'invalid_name':
      return 'Escribí un nombre'
    case 'invalid_player':
      return 'Jugador inválido'
    case 'join_first':
      return 'Primero unite a la sala'
    case 'unknown_message':
      return 'Mensaje desconocido'
    default:
      return 'Error de la sala'
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  })
}
