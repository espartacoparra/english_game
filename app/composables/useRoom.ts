import { computed, markRaw } from 'vue'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  answerMessage,
  createWebSocketTransport,
  generatePlayerId,
  isRoomRaceNotice,
  isValidRoomCode,
  joinMessage,
  normalizeRoomCode,
  resolveRoomWsUrl,
  roomConnectionFailureMessage,
  roomSocketUrl,
  startMessage,
  type FinishedPayload,
  type PublicRoom,
  type RoomClientMessage,
  type RoomPhase,
  type RoomPlayerInfo,
  type RoomServerEvent,
  type RoomTransport,
  type RoundProgressEntry,
  type RoundPrompt,
  type RoundReply,
  type StartOptions,
} from '~/core/room-client'

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
  const prompt = useState<RoundPrompt | null>('room:prompt', () => null)
  const roundIndex = useState<number | null>('room:roundIndex', () => null)
  const totalRounds = useState<number | null>('room:totalRounds', () => null)
  const progress = useState<RoundProgressEntry[]>('room:progress', () => [])
  const result = useState<RoomResult | null>('room:lastResult', () => null)
  const finished = useState<FinishedPayload | null>('room:finished', () => null)
  const errorMessage = useState<string | null>('room:errorMessage', () => null)
  // A message about something that was nobody's fault, such as a round that
  // closed while this player was typing. Neutral, and cleared by the next round.
  const noticeMessage = useState<string | null>('room:noticeMessage', () => null)
  const playerId = useState<string>('room:playerId', () => '')
  const playerName = useState<string>('room:playerName', () => '')
  const joined = useState<boolean>('room:joined', () => false)
  // The address the last attempt dialed. A failed dial names it, so a stopped
  // room Worker reads as "nothing is listening there" instead of a generic
  // "connection lost".
  const socketUrl = useState<string>('room:socketUrl', () => '')
  // Partial credit means a round can add more than the single point the old
  // race awarded, so the mirror keeps track of what it already applied per
  // round instead of guessing from a result.
  const mirrorRound = useState<number | null>('room:mirrorRound', () => null)
  const mirroredPoints = useState<Record<string, number>>('room:mirroredPoints', () => ({}))
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
    const baseUrl = resolveRoomWsUrl(
      String(config.public.roomWsUrl ?? ''),
      typeof window === 'undefined' ? null : window.location
    )

    const url = roomSocketUrl(baseUrl, code.value)
    socketUrl.value = url

    let transport: RoomTransport
    try {
      transport = createWebSocketTransport(url)
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
      // The rooms live in their own Worker: in development the app alone has
      // nothing to connect to, and that is the most common cause by far.
      errorMessage.value = roomConnectionFailureMessage(socketUrl.value)
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

  /**
   * Mirrors the points a round has already awarded.
   *
   * `progress` carries the running total per player, so the scoreboard moves
   * as answers land — partial credit included — and the mirror stays additive
   * instead of re-deriving a single point from the round result. A `state`
   * event still overwrites the whole score map with the authoritative one, and
   * the applied amounts are keyed by round so a repeated frame cannot double
   * count.
   */
  function mirrorProgressPoints(index: number, entries: RoundProgressEntry[]): void {
    if (mirrorRound.value !== index) {
      mirrorRound.value = index
      mirroredPoints.value = {}
    }
    const current = room.value
    if (!current) return

    const scores = { ...current.scores }
    const applied = { ...mirroredPoints.value }
    let changed = false

    for (const entry of entries) {
      // The server sends the player's running total for this round: apply the
      // difference over what this mirror already counted.
      const alreadyApplied = applied[entry.playerId] ?? 0
      if (entry.points <= alreadyApplied) continue
      scores[entry.playerId] = (scores[entry.playerId] ?? 0) + (entry.points - alreadyApplied)
      applied[entry.playerId] = entry.points
      changed = true
    }

    if (!changed) return
    mirroredPoints.value = applied
    room.value = { ...current, scores }
  }

  function applyEvents(events: RoomServerEvent[]): void {
    if (events.length === 0) return

    status.value = 'connected'
    connection.value.attempts = 0

    for (const event of events) {
      switch (event.t) {
        case 'state': {
          room.value = event.room
          prompt.value = event.room.prompt
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
          prompt.value = event.prompt
          roundIndex.value = event.index
          totalRounds.value = event.total
          progress.value = []
          // A new round makes the previous one's lost race irrelevant.
          noticeMessage.value = null
          break
        }
        case 'progress': {
          progress.value = event.answered
          roundIndex.value = event.index
          mirrorProgressPoints(event.index, event.answered)
          break
        }
        case 'result': {
          // Scores are already mirrored from `progress`: the result only holds
          // the round's accounting, so it feeds the panel, never the scoreboard.
          result.value = event
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
          // A lost race is not a mistake: it must not read as one.
          if (isRoomRaceNotice(event.code)) noticeMessage.value = event.message
          else errorMessage.value = event.message
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

  function answer(reply: RoundReply): void {
    if (roundIndex.value === null) return
    const message = answerMessage(roundIndex.value, reply)
    if (!message) {
      console.error('Refusing to send a reply that does not match the room contract', reply)
      errorMessage.value = 'No se pudo enviar la respuesta'
      return
    }
    errorMessage.value = null
    dispatch(message)
  }

  function leave(): void {
    clearRetry()
    joined.value = false
    const transport = connection.value.transport
    connection.value.transport = null
    connection.value.attempts = 0
    transport?.close()

    room.value = null
    prompt.value = null
    roundIndex.value = null
    totalRounds.value = null
    progress.value = []
    result.value = null
    finished.value = null
    errorMessage.value = null
    noticeMessage.value = null
    socketUrl.value = ''
    mirrorRound.value = null
    mirroredPoints.value = {}
    status.value = 'idle'
  }

  // --- derived ------------------------------------------------------------

  const phase = computed<RoomPhase | 'none'>(() => {
    if (finished.value) return 'finished'
    return room.value?.phase ?? 'none'
  })

  const isConnected = computed(() => status.value === 'connected')

  const players = computed<RoomPlayerInfo[]>(() => room.value?.players ?? [])

  const hostId = computed<string | null>(() => room.value?.hostId ?? null)

  /** Only the host starts the game, and only for a room that is still a lobby. */
  const isHost = computed(() => {
    if (!playerId.value) return false
    return hostId.value === playerId.value
  })

  /** First player who is not me, kept for the two-player summaries. */
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
    () =>
      isHost.value &&
      players.value.length >= MIN_PLAYERS &&
      phase.value === 'lobby' &&
      isConnected.value
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

  function scoreFor(id: string): number {
    return room.value?.scores[id] ?? 0
  }

  function pointsFor(id: string): number {
    return progress.value.find((entry) => entry.playerId === id)?.points ?? 0
  }

  return {
    // contract limits, so the UI never hardcodes a two-player room
    MIN_PLAYERS,
    MAX_PLAYERS,
    // state
    status,
    code,
    room,
    prompt,
    roundIndex,
    totalRounds,
    progress,
    result,
    finished,
    errorMessage,
    noticeMessage,
    playerId,
    playerName,
    joined,
    // derived
    phase,
    isConnected,
    players,
    hostId,
    isHost,
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
    // helpers
    playerNameFor,
    scoreFor,
    pointsFor,
  }
}
