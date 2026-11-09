import { computed, markRaw } from 'vue'
import {
  answerMessage,
  createWebSocketTransport,
  generatePlayerId,
  isValidRoomCode,
  joinMessage,
  normalizeRoomCode,
  roomSocketUrl,
  startMessage,
  type FinishedPayload,
  type PublicRoom,
  type RoomClientMessage,
  type RoomPhase,
  type RoomPlayerInfo,
  type RoomServerEvent,
  type RoomTransport,
  type RoundHint,
  type RoundProgressEntry,
  type StartOptions,
} from '~/core/room-client'
import type { TenseKey } from '~/types/verb'

export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export type RoomResult = Extract<RoomServerEvent, { t: 'result' }>

/** Stable localStorage keys: the identity must survive reloads and rejoins. */
export const PLAYER_ID_STORAGE_KEY = 'verbmaster_room_player_id_v1'
export const PLAYER_NAME_STORAGE_KEY = 'verbmaster_room_player_name_v1'

/** Bounded reconnect: a few attempts inside the same tab, then a message. */
export const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_DELAY_MS = 1200

interface RoomConnection {
  transport: RoomTransport | null
  attempts: number
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * Browser adapter over a `RoomTransport`.
 *
 * The transport and the room rules stay pure (`app/core/room-client.ts` and the
 * Durable Object); this composable only owns reactive state, the identity in
 * localStorage and the bounded reconnect loop. Every ref comes from `useState`
 * so nothing leaks between requests or apps.
 */
export function useRoom() {
  const status = useState<RoomStatus>('room:status', () => 'idle')
  const code = useState<string>('room:code', () => '')
  const room = useState<PublicRoom | null>('room:state', () => null)
  const hint = useState<RoundHint | null>('room:hint', () => null)
  const roundIndex = useState<number | null>('room:roundIndex', () => null)
  const totalRounds = useState<number | null>('room:totalRounds', () => null)
  const progress = useState<RoundProgressEntry[]>('room:progress', () => [])
  const result = useState<RoomResult | null>('room:lastResult', () => null)
  const finished = useState<FinishedPayload | null>('room:finished', () => null)
  const errorMessage = useState<string | null>('room:errorMessage', () => null)
  const playerId = useState<string>('room:playerId', () => '')
  const playerName = useState<string>('room:playerName', () => '')
  const joined = useState<boolean>('room:joined', () => false)
  // The socket lives here so every caller shares one link. It is `markRaw`ed:
  // a reactive proxy around a WebSocket breaks its internal invariants.
  const connection = useState<RoomConnection>('room:connection', () => ({
    transport: null,
    attempts: 0,
    timer: null,
  }))

  // --- identity -----------------------------------------------------------

  function loadIdentity(): void {
    if (typeof window === 'undefined') return
    try {
      const storedId = window.localStorage.getItem(PLAYER_ID_STORAGE_KEY)
      const storedName = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY)
      if (storedId) playerId.value = storedId
      if (storedName) playerName.value = storedName
    } catch (err) {
      console.error('Failed to load the room identity from localStorage', err)
    }
  }

  function persistIdentity(): void {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId.value)
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName.value)
    } catch (err) {
      console.error('Failed to save the room identity to localStorage', err)
    }
  }

  function ensureIdentity(): void {
    if (!playerId.value) playerId.value = generatePlayerId()
  }

  // --- socket -------------------------------------------------------------

  function clearRetry(): void {
    if (connection.value.timer !== null) {
      clearTimeout(connection.value.timer)
      connection.value.timer = null
    }
  }

  function openSocket(): void {
    clearRetry()
    connection.value.transport?.close()
    connection.value.transport = null

    const config = useRuntimeConfig()
    const baseUrl = String(config.public.roomWsUrl ?? '')

    let transport: RoomTransport
    try {
      transport = createWebSocketTransport(roomSocketUrl(baseUrl, code.value))
    } catch (err) {
      console.error('Failed to open the room socket', err)
      status.value = 'error'
      errorMessage.value = 'No se pudo abrir la conexión con la sala'
      return
    }

    connection.value.transport = markRaw(transport)
    status.value = 'connecting'
    errorMessage.value = null

    transport.onMessage((events) => applyEvents(events))
    transport.onClose(() => scheduleReconnect())

    // Messages queue until the socket opens, so a rejoin after a drop is safe.
    if (joined.value) sendJoin()
  }

  function scheduleReconnect(): void {
    connection.value.transport = null

    if (typeof window === 'undefined') return
    // A user who never joined has nothing to restore.
    if (!joined.value) {
      status.value = 'idle'
      return
    }

    if (connection.value.attempts >= MAX_RECONNECT_ATTEMPTS) {
      status.value = 'error'
      errorMessage.value = 'Se perdió la conexión con la sala'
      return
    }

    connection.value.attempts += 1
    status.value = 'reconnecting'
    connection.value.timer = setTimeout(() => {
      connection.value.timer = null
      openSocket()
    }, RECONNECT_DELAY_MS)
  }

  function dispatch(message: RoomClientMessage): void {
    const transport = connection.value.transport
    if (!transport) {
      errorMessage.value = 'Sin conexión con la sala'
      return
    }
    transport.send(message)
  }

  function sendJoin(): void {
    dispatch(joinMessage(playerId.value, playerName.value))
  }

  // --- server events ------------------------------------------------------

  function applyEvents(events: RoomServerEvent[]): void {
    if (events.length === 0) return

    status.value = 'connected'
    connection.value.attempts = 0

    for (const event of events) {
      switch (event.t) {
        case 'state': {
          room.value = event.room
          hint.value = event.room.hint
          roundIndex.value = event.room.roundIndex
          totalRounds.value = event.room.totalRounds
          if (event.room.phase === 'lobby') {
            finished.value = null
            result.value = null
            progress.value = []
          }
          if (event.room.phase === 'finished') {
            finished.value = { scores: { ...event.room.scores }, players: event.room.players }
          }
          break
        }
        case 'round': {
          hint.value = event.hint
          roundIndex.value = event.index
          totalRounds.value = event.total
          progress.value = []
          break
        }
        case 'progress': {
          progress.value = event.answered
          roundIndex.value = event.index
          break
        }
        case 'result': {
          result.value = event
          // The server is authoritative for the point, but its `scores` only
          // travel in `state`/`finished` events, so mirror the single point here
          // to keep the live scoreboard honest.
          if (event.winnerId && room.value) {
            const scores = { ...room.value.scores }
            scores[event.winnerId] = (scores[event.winnerId] ?? 0) + 1
            room.value = { ...room.value, scores }
          }
          break
        }
        case 'finished': {
          finished.value = { scores: { ...event.scores }, players: event.players }
          if (room.value) {
            room.value = { ...room.value, phase: 'finished', scores: { ...event.scores } }
          }
          break
        }
        case 'error': {
          errorMessage.value = event.message
          break
        }
      }
    }
  }

  // --- actions ------------------------------------------------------------

  function connect(nextCode?: string): void {
    if (nextCode !== undefined) code.value = normalizeRoomCode(nextCode)

    if (!isValidRoomCode(code.value)) {
      clearRetry()
      connection.value.transport?.close()
      connection.value.transport = null
      status.value = 'error'
      errorMessage.value = 'Código de sala inválido'
      return
    }

    // No sockets on the server: the page connects on mount, client only.
    if (typeof window === 'undefined') return

    loadIdentity()
    ensureIdentity()
    persistIdentity()
    openSocket()
  }

  function join(name?: string): void {
    const next = (name ?? playerName.value).trim().slice(0, 24)
    if (!next) {
      errorMessage.value = 'Escribí un nombre'
      return
    }

    loadIdentity()
    ensureIdentity()
    playerName.value = next
    persistIdentity()
    joined.value = true
    errorMessage.value = null

    if (!connection.value.transport) {
      connect()
      return
    }
    sendJoin()
  }

  function start(options: StartOptions = {}): void {
    errorMessage.value = null
    dispatch(startMessage(options))
  }

  function answer(answers: Record<TenseKey, string>): void {
    if (roundIndex.value === null) return
    errorMessage.value = null
    dispatch(answerMessage(roundIndex.value, answers))
  }

  function leave(): void {
    clearRetry()
    joined.value = false
    const transport = connection.value.transport
    connection.value.transport = null
    connection.value.attempts = 0
    transport?.close()

    room.value = null
    hint.value = null
    roundIndex.value = null
    totalRounds.value = null
    progress.value = []
    result.value = null
    finished.value = null
    errorMessage.value = null
    status.value = 'idle'
  }

  // --- derived ------------------------------------------------------------

  const phase = computed<RoomPhase | 'none'>(() => {
    if (finished.value) return 'finished'
    return room.value?.phase ?? 'none'
  })

  const isConnected = computed(() => status.value === 'connected')

  const players = computed<RoomPlayerInfo[]>(() => room.value?.players ?? [])

  const opponent = computed<RoomPlayerInfo | null>(
    () => players.value.find((player) => player.id !== playerId.value) ?? null
  )

  const myScore = computed(() => room.value?.scores[playerId.value] ?? 0)

  const opponentScore = computed(() => {
    const other = opponent.value
    if (!other) return 0
    return room.value?.scores[other.id] ?? 0
  })

  const canStart = computed(
    () => players.value.length >= 2 && phase.value === 'lobby' && isConnected.value
  )

  const hasAnsweredCurrentRound = computed(() =>
    progress.value.some((entry) => entry.playerId === playerId.value)
  )

  /** Progress keeps arrival order, so the first entry answered first. */
  const firstAnsweredPlayerId = computed<string | null>(
    () => progress.value[0]?.playerId ?? null
  )

  function playerNameFor(id: string | null): string {
    if (!id) return ''
    const player = players.value.find((entry) => entry.id === id)
    return player?.name ?? 'Jugador'
  }

  return {
    // state
    status,
    code,
    room,
    hint,
    roundIndex,
    totalRounds,
    progress,
    result,
    finished,
    errorMessage,
    playerId,
    playerName,
    joined,
    // derived
    phase,
    isConnected,
    players,
    opponent,
    myScore,
    opponentScore,
    canStart,
    hasAnsweredCurrentRound,
    firstAnsweredPlayerId,
    // actions
    connect,
    join,
    start,
    answer,
    leave,
    playerNameFor,
  }
}
