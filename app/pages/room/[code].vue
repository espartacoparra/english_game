<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoom } from '~/composables/useRoom'
import {
  isValidRoomCode,
  normalizeRoomCode,
  type RoomMode,
  type RoundPrompt,
  type RoundReply,
} from '~/core/room-client'
import { DEFAULT_ROOM_MODE, isRoomMode, roomModeLabel } from '~/components/room/room-modes'
import RoomModeSelect from '~/components/room/RoomModeSelect.vue'
import RoomRoundTenses from '~/components/room/RoomRoundTenses.vue'
import RoomRoundList from '~/components/room/RoomRoundList.vue'
import RoomRoundChoice from '~/components/room/RoomRoundChoice.vue'
import RoomRoundBoard from '~/components/room/RoomRoundBoard.vue'

import type { VerbLevel, VerbType } from '~/types/verb'

const route = useRoute()

const roomCode = computed(() => normalizeRoomCode(String(route.params.code ?? '')))
const codeIsValid = computed(() => isValidRoomCode(roomCode.value))

const {
  status,
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
  phase,
  players,
  isHost,
  canStart,
  hasAnsweredCurrentRound,
  firstAnsweredPlayerId,
  MIN_PLAYERS,
  MAX_PLAYERS,
  connect,
  join,
  start,
  answer,
  leave,
  playerNameFor,
} = useRoom()

const statusLabels = {
  idle: 'Sin conectar',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
  error: 'Sin conexión',
} as const

const ROUNDS_PER_GAME = 5

const nameInput = ref('')
const submittedRound = ref<number | null>(null)
const copyState = ref<'idle' | 'code' | 'link' | 'failed'>('idle')
const roomLink = ref('')
let copyTimer: ReturnType<typeof setTimeout> | null = null

const queryMode = route.query.mode
const selectedMode = ref<RoomMode>(isRoomMode(queryMode) ? queryMode : DEFAULT_ROOM_MODE)

// Game setup options for the room
const queryCount = route.query.count
const parsedCount = queryCount === 'all' ? 'all' : Number(queryCount)
const selectedCount = ref<number | 'all'>(
  queryCount === 'all' ? 'all' : [5, 10, 15, 20].includes(parsedCount) ? parsedCount : 10
)

const queryType = String(route.query.type ?? '')
const selectedType = ref<VerbType | 'all'>(
  ['regular', 'irregular', 'all'].includes(queryType) ? (queryType as VerbType | 'all') : 'all'
)

const queryLevel = String(route.query.level ?? '')
const selectedLevel = ref<VerbLevel | 'all'>(
  ['A1', 'A2', 'B1', 'B2', 'all'].includes(queryLevel) ? (queryLevel as VerbLevel | 'all') : 'all'
)

const isVerbsMode = computed(() =>
  ['write-all', 'fill-missing', 'card-matching'].includes(selectedMode.value)
)

/** Up to eight slots: the lobby shows the empty ones instead of hiding them. */
const playerSlots = computed(() =>
  Array.from({ length: MAX_PLAYERS }, (_, index) => players.value[index] ?? null)
)

/** The board asks for names by id, and must never guess whose turn it is. */
const playerNames = computed<Record<string, string>>(() =>
  Object.fromEntries(players.value.map((player) => [player.id, player.name]))
)

const roundNumber = computed(() => (roundIndex.value === null ? 0 : roundIndex.value + 1))

const progressPercent = computed(() => {
  if (!totalRounds.value) return 0
  return Math.round(((roundNumber.value - 1) / totalRounds.value) * 100)
})

/** Local echo of a submit plus the server's authoritative progress. */
const answersLocked = computed(() => {
  if (submittedRound.value !== null && submittedRound.value === roundIndex.value) return true
  return hasAnsweredCurrentRound.value
})

/** A result describes the round that just closed, so it survives the next round. */
const shownResult = computed(() => {
  if (!result.value || phase.value === 'finished') return null
  return result.value
})

const winnerLabel = computed(() => {
  const current = shownResult.value
  if (!current) return ''
  if (!current.winnerId) return 'Nadie cerró la ronda'
  if (current.winnerId === playerId.value) return '¡Ganaste la ronda!'
  return `Ganó ${playerNameFor(current.winnerId)}`
})

const firstAnswerer = computed(() => {
  const id = firstAnsweredPlayerId.value
  if (!id) return ''
  if (id === playerId.value) return 'Contestaste primero'
  return `Contestó primero ${playerNameFor(id)}`
})

const startHint = computed(() => {
  if (!isHost.value) return 'Solo quien creó la sala puede empezar la partida.'
  if (players.value.length < MIN_PLAYERS) {
    return `Hacen falta ${MIN_PLAYERS} jugadores para empezar.`
  }
  if (!canStart.value) return 'Conectando con la sala…'
  return ''
})

const modeLabel = computed(() => roomModeLabel(room.value?.mode ?? selectedMode.value))

/** Ranked players for the final screen, highest score first. */
const finalRanking = computed(() => {
  const list = finished.value?.players ?? players.value
  const scores = finished.value?.scores ?? room.value?.scores ?? {}
  return [...list]
    .map((player) => ({ ...player, score: scores[player.id] ?? 0 }))
    .sort((a, b) => b.score - a.score)
})

// The dispatcher only hands a component a prompt of its own family, so each
// branch keeps its narrowed type without relying on template narrowing.
const tensesPrompt = computed(() => (prompt.value?.kind === 'tenses' ? prompt.value : null))
const choicePrompt = computed(() => (prompt.value?.kind === 'choice' ? prompt.value : null))
const listPrompt = computed(() => (prompt.value?.kind === 'list' ? prompt.value : null))
const boardPrompt = computed(() => (prompt.value?.kind === 'board' ? prompt.value : null))

function summaryFor(value: RoundPrompt): string {
  switch (value.kind) {
    case 'tenses':
      return `${value.spanish} · ${value.type === 'irregular' ? 'irregular' : 'regular'} · ${value.level}`
    case 'choice':
      return value.item
    case 'list':
      return value.word
    case 'board':
      return `Cadenas completadas: ${value.completedChains} de ${value.totalChains}`
  }
}

function resetRoundInputs(): void {
  submittedRound.value = null
}

watch(roundIndex, () => {
  resetRoundInputs()
})

// Nuxt reuses this page component when only the room code changes, so follow
// the param instead of relying on a fresh mount.
watch(roomCode, (nextCode) => {
  const nextMode = route.query.mode
  selectedMode.value = isRoomMode(nextMode) ? nextMode : DEFAULT_ROOM_MODE
  if (typeof window === 'undefined') return
  leave()
  if (!isValidRoomCode(nextCode)) return
  connect(nextCode)
  nameInput.value = playerName.value
  if (nameInput.value) join(nameInput.value)
})

function handleJoin(): void {
  join(nameInput.value)
}

function handleStart(): void {
  if (!canStart.value) return
  start({
    mode: selectedMode.value,
    count: selectedCount.value,
    type: isVerbsMode.value ? selectedType.value : 'all',
    level: isVerbsMode.value ? selectedLevel.value : 'all',
  })
}

function handleReply(reply: RoundReply): void {
  if (roundIndex.value === null || answersLocked.value) return
  answer(reply)
  submittedRound.value = roundIndex.value
}

function resetCopyState(): void {
  if (copyTimer !== null) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copyTimer = null
    copyState.value = 'idle'
  }, 2000)
}

async function copyText(text: string, kind: 'code' | 'link'): Promise<void> {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copyState.value = kind
    resetCopyState()
  } catch {
    copyState.value = 'failed'
  }
}

function playerSubmitted(playerIdToCheck: string): boolean {
  return progress.value.some((entry) => entry.playerId === playerIdToCheck)
}

function playerPoints(playerIdToCheck: string): number {
  return progress.value.find((entry) => entry.playerId === playerIdToCheck)?.points ?? 0
}

onMounted(() => {
  roomLink.value = window.location.href
  if (!codeIsValid.value) return
  connect(roomCode.value)
  nameInput.value = playerName.value
  if (nameInput.value) join(nameInput.value)
})

onUnmounted(() => {
  if (copyTimer !== null) clearTimeout(copyTimer)
  leave()
})
</script>

<template>
  <div class="room-page">
    <header class="room-header">
      <NuxtLink to="/" class="exit-btn">← Menú principal</NuxtLink>

      <div class="room-code-block">
        <span class="room-code-label">Sala</span>
        <span class="room-code">{{ roomCode || '—' }}</span>
      </div>

      <div class="header-actions">
        <span class="status-pill" :class="`status-${status}`">
          <span class="status-dot" />
          {{ statusLabels[status] }}
        </span>
        <button v-if="codeIsValid" type="button" class="ghost-btn" @click="copyText(roomCode, 'code')">
          {{ copyState === 'code' ? '¡Copiado!' : 'Copiar código' }}
        </button>
        <button v-if="codeIsValid" type="button" class="ghost-btn" @click="copyText(roomLink, 'link')">
          {{ copyState === 'link' ? '¡Copiado!' : 'Copiar enlace' }}
        </button>
      </div>
    </header>

    <!-- Invalid code -->
    <main v-if="!codeIsValid" class="room-card animate-pop">
      <h1 class="card-title">Código inválido</h1>
      <p class="card-text">
        El código de sala debe tener 6 caracteres entre A-Z y 0-9. Revisá el enlace que te compartieron.
      </p>
      <NuxtLink to="/" class="primary-btn">Volver al menú</NuxtLink>
    </main>

    <template v-else>
      <p v-if="errorMessage" class="error-banner">
        {{ errorMessage }}
      </p>
      <p v-if="noticeMessage" class="notice-banner">
        {{ noticeMessage }}
      </p>
      <p v-if="copyState === 'failed' && roomLink" class="hint-banner">
        No se pudo copiar. Enlace de la sala: <code>{{ roomLink }}</code>
      </p>

      <!-- Lobby -->
      <main v-if="phase === 'lobby' || phase === 'none'" class="room-card animate-pop">
        <h1 class="card-title">Sala de {{ MIN_PLAYERS }} a {{ MAX_PLAYERS }} jugadores</h1>
        <p class="card-text">
          Compartí el enlace o el código. Cuando estén al menos {{ MIN_PLAYERS }}, quien creó la
          sala elige el modo y empieza la partida.
        </p>

        <ul class="player-list">
          <li
            v-for="(slot, index) in playerSlots"
            :key="index"
            class="player-row"
            :class="{ 'player-row--empty': !slot }"
          >
            <span class="player-slot">{{ index + 1 }}</span>
            <span class="player-name">{{ slot?.name ?? 'Esperando jugador…' }}</span>
            <span v-if="slot && slot.id === room?.hostId" class="host-tag">Anfitrión</span>
            <span v-if="slot && slot.id === playerId" class="you-tag">Vos</span>
          </li>
        </ul>

        <form class="name-form" @submit.prevent="handleJoin">
          <label for="player-name" class="field-label">Tu nombre</label>
          <div class="name-row">
            <input
              id="player-name"
              v-model="nameInput"
              type="text"
              maxlength="24"
              autocomplete="nickname"
              placeholder="ej. Ana"
              class="text-input"
            />
            <button type="submit" class="ghost-btn">
              {{ players.some((player) => player.id === playerId) ? 'Actualizar' : 'Unirme' }}
            </button>
          </div>
        </form>

        <div v-if="isHost" class="room-setup-options">
          <RoomModeSelect v-model="selectedMode" label="Modo de juego" />

          <div class="setup-row">
            <div class="setup-field">
              <label class="field-label">Rondas</label>
              <div class="mini-chip-group">
                <button
                  v-for="cnt in [5, 10, 15, 20]"
                  :key="cnt"
                  type="button"
                  class="mini-chip"
                  :class="{ active: selectedCount === cnt }"
                  @click="selectedCount = cnt"
                >
                  {{ cnt }}
                </button>
              </div>
            </div>

            <template v-if="isVerbsMode">
              <div class="setup-field">
                <label class="field-label">Tipo</label>
                <div class="mini-chip-group">
                  <button
                    v-for="t in [{ id: 'all', label: 'Todos' }, { id: 'irregular', label: 'Irreg.' }, { id: 'regular', label: 'Reg.' }]"
                    :key="t.id"
                    type="button"
                    class="mini-chip"
                    :class="{ active: selectedType === t.id }"
                    @click="selectedType = t.id as VerbType | 'all'"
                  >
                    {{ t.label }}
                  </button>
                </div>
              </div>

              <div class="setup-field">
                <label class="field-label">Nivel</label>
                <div class="mini-chip-group">
                  <button
                    v-for="lvl in ['all', 'A1', 'A2', 'B1', 'B2']"
                    :key="lvl"
                    type="button"
                    class="mini-chip"
                    :class="{ active: selectedLevel === lvl }"
                    @click="selectedLevel = lvl as VerbLevel | 'all'"
                  >
                    {{ lvl === 'all' ? 'Todos' : lvl }}
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div v-else class="mode-readonly-box">
          <p class="mode-readonly">Modo: <strong>{{ modeLabel }}</strong></p>
          <p class="config-readonly">
            <span>Rondas: <strong>{{ selectedCount }}</strong></span>
            <template v-if="isVerbsMode">
              <span> · Tipo: <strong>{{ selectedType === 'all' ? 'Todos' : selectedType }}</strong></span>
              <span> · Nivel: <strong>{{ selectedLevel === 'all' ? 'Todos' : selectedLevel }}</strong></span>
            </template>
          </p>
        </div>

        <button type="button" class="primary-btn" :disabled="!canStart" @click="handleStart">
          Empezar partida
        </button>
        <p v-if="startHint" class="footnote">{{ startHint }}</p>
      </main>

      <!-- Playing -->
      <main v-else-if="phase === 'playing'" class="room-card animate-pop">
        <header class="scoreboard">
          <div
            v-for="player in players"
            :key="player.id"
            class="score-cell"
            :class="{ 'score-cell--me': player.id === playerId }"
          >
            <span class="score-name">{{ player.id === playerId ? 'Vos' : player.name }}</span>
            <span class="score-value">{{ room?.scores[player.id] ?? 0 }}</span>
          </div>
        </header>

        <div class="round-strip">
          <span>Ronda {{ roundNumber }} de {{ totalRounds ?? '?' }}</span>
          <span v-if="firstAnswerer" class="first-answerer">{{ firstAnswerer }}</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }" />
        </div>

        <div
          v-if="shownResult"
          class="result-panel"
          :class="shownResult.winnerId ? 'result-panel--win' : 'result-panel--none'"
        >
          <p class="result-title">{{ winnerLabel }}</p>
          <p class="result-prompt">{{ summaryFor(shownResult.prompt) }}</p>
          <p v-if="shownResult.solution" class="result-solution">
            <strong>Solución:</strong> {{ shownResult.solution }}
          </p>
          <ul class="result-answers">
            <li v-for="entry in shownResult.outcomes" :key="entry.playerId" class="result-answer-row">
              <span class="result-player">{{ playerNameFor(entry.playerId) }}</span>
              <span class="result-mark" :class="entry.correct ? 'mark-ok' : 'mark-bad'">
                {{ entry.correct ? '✓' : '✗' }}
              </span>
              <span class="result-points">+{{ entry.points }}</span>
              <span v-if="entry.detail" class="result-forms">{{ entry.detail }}</span>
            </li>
          </ul>
        </div>

        <div v-if="prompt" class="round-panel">
          <RoomRoundTenses
            v-if="tensesPrompt"
            :prompt="tensesPrompt"
            :disabled="answersLocked"
            @submit="handleReply"
          />
          <RoomRoundList
            v-else-if="listPrompt"
            :prompt="listPrompt"
            :key="roundIndex ?? 0"
            :disabled="answersLocked"
            @submit="handleReply"
          />
          <RoomRoundChoice
            v-else-if="choicePrompt"
            :prompt="choicePrompt"
            :key="roundIndex ?? 0"
            :disabled="answersLocked"
            @submit="handleReply"
          />
          <RoomRoundBoard
            v-else-if="boardPrompt"
            :prompt="boardPrompt"
            :key="roundIndex ?? 0"
            :disabled="answersLocked"
            :player-names="playerNames"
            :self-id="playerId"
            @submit="handleReply"
          />
        </div>
        <p v-else class="footnote">Esperando la ronda…</p>

        <ul class="live-progress">
          <li v-for="player in players" :key="player.id" class="live-progress-row">
            <span class="live-progress-name">{{ player.id === playerId ? 'Vos' : player.name }}</span>
            <span v-if="playerSubmitted(player.id)" class="answered-tag">
              contestó · +{{ playerPoints(player.id) }}
            </span>
            <span v-else class="waiting-tag">pensando…</span>
          </li>
        </ul>
      </main>

      <!-- Finished -->
      <main v-else class="room-card animate-pop">
        <h1 class="card-title">Partida terminada</h1>
        <p class="card-text">Modo: {{ modeLabel }}</p>

        <ul class="player-list">
          <li v-for="(player, index) in finalRanking" :key="player.id" class="player-row">
            <span class="player-slot">{{ index + 1 }}</span>
            <span class="player-name">{{ player.name }}</span>
            <span v-if="player.id === playerId" class="you-tag">Vos</span>
            <span class="player-score">{{ player.score }}</span>
          </li>
        </ul>

        <NuxtLink to="/" class="primary-btn">Volver al menú</NuxtLink>
      </main>
    </template>
  </div>
</template>

<style scoped>
.room-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}

.room-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.exit-btn {
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 0.5rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.825rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s ease;
}

.exit-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.room-code-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}

.room-code-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.room-code {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #fff;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background: var(--surface-card);
  font-size: 0.725rem;
  font-weight: 700;
  color: var(--text-muted);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-dim);
}

.status-connected .status-dot {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
}

.status-connecting .status-dot,
.status-reconnecting .status-dot {
  background: var(--streak);
  box-shadow: 0 0 8px var(--streak-glow);
}

.status-error .status-dot {
  background: var(--error);
  box-shadow: 0 0 8px var(--error);
}

.ghost-btn {
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 0.45rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.775rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.ghost-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.room-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.75rem;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(20px);
}

.card-title {
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}

.card-text {
  color: var(--text-muted);
  font-size: 0.925rem;
}

.error-banner {
  padding: 0.7rem 1rem;
  margin-bottom: 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--error-border);
  background: var(--error-bg);
  color: #fecdd3;
  font-size: 0.85rem;
  font-weight: 600;
}

/* Information, not a reprimand: a round that closed while this player was
   typing is a lost race, and the answer may well have been right. */
.notice-banner {
  padding: 0.7rem 1rem;
  margin-bottom: 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--surface-inset);
  color: var(--text-muted);
  font-size: 0.85rem;
}

.hint-banner {
  padding: 0.7rem 1rem;
  margin-bottom: 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--surface-inset);
  color: var(--text-muted);
  font-size: 0.8rem;
  word-break: break-all;
}

.player-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.player-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.9rem;
  border-radius: var(--radius-sm);
  background: var(--surface-inset);
  border: 1px solid var(--border-subtle);
}

.player-row--empty {
  opacity: 0.55;
  border-style: dashed;
}

.player-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--radius-full);
  background: rgba(99, 102, 241, 0.2);
  color: var(--primary-light);
  font-size: 0.75rem;
  font-weight: 800;
}

.player-name {
  flex: 1;
  font-weight: 600;
  color: var(--text-main);
}

.you-tag {
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--primary-light);
}

.host-tag {
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--streak);
}

.player-score {
  font-family: var(--font-mono);
  font-weight: 800;
  color: #fff;
}

.name-form {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-label {
  font-size: 0.775rem;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.name-row {
  display: flex;
  gap: 0.5rem;
}

.text-input {
  flex: 1;
  width: 100%;
  padding: 0.7rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--surface-inset);
  color: var(--text-main);
  font: inherit;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.text-input:focus {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.2);
}

.text-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mode-readonly {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.mode-readonly-box {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.75rem 1rem;
  background: var(--surface-inset);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.config-readonly {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin: 0;
}

.room-setup-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setup-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.setup-field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.mini-chip-group {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.mini-chip {
  padding: 0.3rem 0.65rem;
  font-size: 0.775rem;
  font-weight: 600;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.mini-chip:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.mini-chip.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.primary-btn {
  text-align: center;
  padding: 0.8rem 1.25rem;
  border: none;
  border-radius: var(--radius-md);
  background: var(--primary-gradient);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.primary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glow);
}

.primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.footnote {
  font-size: 0.8rem;
  color: var(--text-dim);
  text-align: center;
}

.scoreboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 0.5rem;
  padding: 0.6rem;
  border-radius: var(--radius-md);
  background: var(--surface-inset);
  border: 1px solid var(--border-subtle);
}

.score-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.4rem 0.25rem;
  border-radius: var(--radius-sm);
}

.score-cell--me {
  background: rgba(99, 102, 241, 0.14);
}

.score-name {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
  max-width: 12ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.score-cell--me .score-name {
  color: var(--primary-light);
}

.score-value {
  font-size: 1.4rem;
  font-weight: 800;
  color: #fff;
}

.round-strip {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
}

.first-answerer {
  color: var(--streak);
}

.progress-bar-track {
  height: 6px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--primary-gradient);
  transition: width 0.3s ease;
}

.result-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.9rem 1rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--surface-inset);
}

.result-panel--win {
  border-color: var(--success-border);
  background: var(--success-bg);
}

.result-title {
  font-weight: 800;
  font-size: 0.9rem;
  color: #fff;
}

.result-prompt {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.result-solution {
  font-size: 0.85rem;
  color: var(--text-main);
}

.result-answers {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.result-answer-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.result-player {
  min-width: 6ch;
  font-weight: 700;
  color: var(--text-main);
}

.result-mark {
  font-weight: 800;
}

.mark-ok {
  color: var(--success);
}

.mark-bad {
  color: var(--error);
}

.result-points {
  font-family: var(--font-mono);
  font-weight: 800;
  color: var(--primary-light);
}

.result-forms {
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

.round-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.live-progress {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.live-progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem;
  border-radius: var(--radius-sm);
  background: var(--surface-inset);
}

.live-progress-name {
  font-weight: 700;
  color: var(--text-main);
}

.answered-tag {
  color: var(--success);
  font-weight: 700;
}

.waiting-tag {
  color: var(--text-dim);
}
</style>
