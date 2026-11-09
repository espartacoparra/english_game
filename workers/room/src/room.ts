import {
  createRoom,
  joinRoom,
  publicRoom,
  startGame,
  submitAnswer,
  type RoomEvent,
  type RoomState,
} from './machine'
import type { GameMode, TenseKey, VerbLevel, VerbType } from '../../../app/types/verb'

export interface Env {
  ROOMS: DurableObjectNamespace
}

interface Attachment {
  playerId: string
}

type ClientMessage =
  | { t: 'join'; playerId: string; name: string }
  | {
      t: 'start'
      mode?: GameMode
      count?: number | 'all'
      type?: VerbType | 'all'
      level?: VerbLevel | 'all'
    }
  | { t: 'answer'; index: number; answers: Partial<Record<TenseKey, string>> }

const ROOM_KEY = 'room'

/**
 * One Durable Object per room code.
 *
 * WebSockets use the Hibernation API, so an idle room costs no duration. All
 * mutations go through the pure machine in `machine.ts`; this class only owns
 * sockets, persistence and broadcasting, which also gives the race a single
 * serialized order of arrival.
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
    let message: ClientMessage
    try {
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
      message = JSON.parse(text) as ClientMessage
    } catch {
      this.send(ws, { t: 'error', code: 'bad_json', message: 'Mensaje inválido' })
      return
    }

    if (!this.room) {
      this.send(ws, { t: 'error', code: 'no_room', message: 'Sala inexistente' })
      return
    }

    if (message.t === 'join') {
      const result = joinRoom(
        this.room,
        { name: message.name ?? '', playerId: message.playerId ?? '' },
        Date.now()
      )
      if (!result.ok) return this.send(ws, errorEvent(result.error))
      this.room = result.state
      ws.serializeAttachment({ playerId: message.playerId } satisfies Attachment)
      await this.persist()
      this.broadcast(result.events)
      return
    }

    const playerId = (ws.deserializeAttachment() as Attachment | null)?.playerId
    if (!playerId) {
      this.send(ws, { t: 'error', code: 'join_first', message: 'Primero unite a la sala' })
      return
    }

    if (message.t === 'start') {
      const result = startGame(
        this.room,
        {
          mode: message.mode,
          count: message.count,
          type: message.type,
          level: message.level,
        },
        Date.now()
      )
      if (!result.ok) return this.send(ws, errorEvent(result.error))
      this.room = result.state
      await this.persist()
      this.broadcast(result.events)
      return
    }

    if (message.t === 'answer') {
      const result = submitAnswer(this.room, playerId, message.index, message.answers ?? {}, Date.now())
      if (!result.ok) return this.send(ws, errorEvent(result.error))
      this.room = result.state
      await this.persist()
      this.broadcast(result.events)
      return
    }

    this.send(ws, { t: 'error', code: 'unknown_message', message: 'Mensaje desconocido' })
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason)
    } catch {
      // The socket may already be closed.
    }
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

  private broadcast(events: RoomEvent[]): void {
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

function errorEvent(code: string): { t: 'error'; code: string; message: string } {
  return { t: 'error', code, message: errorMessage(code) }
}

function errorMessage(code: string): string {
  switch (code) {
    case 'room_full':
      return 'La sala ya tiene dos jugadores'
    case 'game_in_progress':
      return 'La partida ya empezó'
    case 'need_two_players':
      return 'Hacen falta dos jugadores'
    case 'already_started':
      return 'La partida ya empezó'
    case 'already_answered':
      return 'Ya contestaste este verbo'
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
