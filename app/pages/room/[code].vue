<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoom } from '~/composables/useRoom'
import { isValidRoomCode, normalizeRoomCode } from '~/core/room-client'
import type { TenseKey } from '~/types/verb'

const route = useRoute()

const roomCode = computed(() => normalizeRoomCode(String(route.params.code ?? '')))
const codeIsValid = computed(() => isValidRoomCode(roomCode.value))

const {
  status,
  hint,
  roundIndex,
  totalRounds,
  progress,
  result,
  finished,
  errorMessage,
  playerId,
  playerName,
  phase,
  players,
  opponent,
  myScore,
  opponentScore,
  canStart,
  hasAnsweredCurrentRound,
  firstAnsweredPlayerId,
  connect,
  join,
  start,
  answer,
  leave,
  playerNameFor,
} = useRoom()

const tenseOrder: TenseKey[] = ['base', 'past', 'participle']

const tenseLabels: Record<TenseKey, string> = {
  base: 'Infinitivo (Base)',
  past: 'Pasado Simple (Past)',
  participle: 'Participio (Participle)',
}

const statusLabels = {
  idle: 'Sin conectar',
  connecting: 'Conectando…',
  connected: 'Conectado',
  reconnecting: 'Reconectando…',
  error: 'Sin conexión',
} as const

const nameInput = ref('')
const answers = ref<Record<TenseKey, string>>({ base: '', past: '', participle: '' })
const submittedRound = ref<number | null>(null)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')
const roomLink = ref('')

const ROUNDS_PER_GAME = 5

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
  if (!current.winnerId) return 'Nadie acertó esta ronda'
  if (current.winnerId === playerId.value) return '¡Ganaste la ronda!'
  return `Ganó ${playerNameFor(current.winnerId)}`
})

const firstAnswerer = computed(() => {
  const id = firstAnsweredPlayerId.value
  if (!id) return ''
  if (id === playerId.value) return 'Contestaste primero'
  return `Contestó primero ${playerNameFor(id)}`
})

const finalWinner = computed(() => {
  if (!finished.value) return ''
  if (!finished.value.players || finished.value.players.length < 2) return ''
  const [first, second] = [finished.value.players[0], finished.value.players[1]]
  if (!first || !second) return ''
  const firstScore = finished.value.scores[first.id] ?? 0
  const secondScore = finished.value.scores[second.id] ?? 0
  if (firstScore === secondScore) return 'Empate'
  return firstScore > secondScore ? `Ganó ${first.name}` : `Ganó ${second.name}`
})

function resetRoundInputs(): void {
  answers.value = { base: '', past: '', participle: '' }
  submittedRound.value = null
}

watch(roundIndex, () => {
  resetRoundInputs()
})

// Nuxt reuses this page component when only the room code changes, so follow
// the param instead of relying on a fresh mount.
watch(roomCode, (nextCode) => {
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
  start({ mode: 'write-all', count: ROUNDS_PER_GAME })
}

function handleSubmit(): void {
  if (roundIndex.value === null || answersLocked.value) return
  answer({ ...answers.value })
  submittedRound.value = roundIndex.value
}

async function copyRoomLink(): Promise<void> {
  if (!roomLink.value) return
  try {
    await navigator.clipboard.writeText(roomLink.value)
    copyState.value = 'copied'
  } catch {
    copyState.value = 'failed'
  }
}

function playerSubmitted(playerIdToCheck: string): boolean {
  return progress.value.some((entry) => entry.playerId === playerIdToCheck)
}

function playerAnswerLabel(entry: { correct: boolean }): string {
  return entry.correct ? '✓' : '✗'
}

onMounted(() => {
  roomLink.value = window.location.href
  if (!codeIsValid.value) return
  connect(roomCode.value)
  nameInput.value = playerName.value
  if (nameInput.value) join(nameInput.value)
})

onUnmounted(() => {
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
        <button v-if="codeIsValid" type="button" class="ghost-btn" @click="copyRoomLink">
          {{ copyState === 'copied' ? '¡Copiado!' : copyState === 'failed' ? 'Copiá el enlace' : 'Copiar enlace' }}
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
      <p v-if="copyState === 'failed' && roomLink" class="hint-banner">
        Enlace de la sala: <code>{{ roomLink }}</code>
      </p>

      <!-- Lobby -->
      <main v-if="phase === 'lobby' || phase === 'none'" class="room-card animate-pop">
        <h1 class="card-title">Sala de dos jugadores</h1>
        <p class="card-text">
          Compartí el enlace con un amigo. Cuando estén los dos, empieza la carrera: gana la ronda
          quien acierte primero las tres formas.
        </p>

        <ul class="player-list">
          <li class="player-row">
            <span class="player-slot">1</span>
            <span class="player-name">{{ players[0]?.name ?? 'Esperando jugador…' }}</span>
            <span v-if="players[0]?.id === playerId" class="you-tag">Vos</span>
          </li>
          <li class="player-row">
            <span class="player-slot">2</span>
            <span class="player-name">{{ players[1]?.name ?? 'Esperando jugador…' }}</span>
            <span v-if="players[1]?.id === playerId" class="you-tag">Vos</span>
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

        <button type="button" class="primary-btn" :disabled="!canStart" @click="handleStart">
          Empezar partida
        </button>
        <p v-if="!canStart" class="footnote">
          {{ players.length < 2 ? 'Hacen falta dos jugadores para empezar.' : 'Conectando con la sala…' }}
        </p>
      </main>

      <!-- Race -->
      <main v-else-if="phase === 'playing'" class="room-card animate-pop">
        <header class="scoreboard">
          <div class="score-cell" :class="{ 'score-cell--me': true }">
            <span class="score-name">{{ playerName || 'Vos' }}</span>
            <span class="score-value">{{ myScore }}</span>
          </div>
          <span class="score-vs">vs</span>
          <div class="score-cell">
            <span class="score-name">{{ opponent?.name ?? 'Rival' }}</span>
            <span class="score-value">{{ opponentScore }}</span>
          </div>
        </header>

        <div class="round-strip">
          <span>Verbo {{ roundNumber }} de {{ totalRounds ?? '?' }}</span>
          <span v-if="firstAnswerer" class="first-answerer">{{ firstAnswerer }}</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }" />
        </div>

        <div v-if="shownResult" class="result-panel" :class="shownResult.winnerId ? 'result-panel--win' : 'result-panel--none'">
          <p class="result-title">{{ winnerLabel }}</p>
          <p class="result-verb">
            <strong>{{ shownResult.verb.spanish }}</strong> ·
            {{ shownResult.verb.base }} / {{ shownResult.verb.past }} / {{ shownResult.verb.participle }}
          </p>
          <ul class="result-answers">
            <li v-for="entry in shownResult.answers" :key="entry.playerId" class="result-answer-row">
              <span class="result-player">{{ playerNameFor(entry.playerId) }}</span>
              <span class="result-mark" :class="entry.correct ? 'mark-ok' : 'mark-bad'">
                {{ playerAnswerLabel(entry) }}
              </span>
              <span class="result-forms">
                {{ entry.answers.base || '—' }} / {{ entry.answers.past || '—' }} /
                {{ entry.answers.participle || '—' }}
              </span>
            </li>
          </ul>
        </div>

        <div v-if="hint" class="prompt-box">
          <div class="badges">
            <span class="badge" :class="hint.type === 'irregular' ? 'badge-irregular' : 'badge-regular'">
              {{ hint.type === 'irregular' ? 'Irregular' : 'Regular' }}
            </span>
            <span class="badge badge-level">Nivel {{ hint.level }}</span>
          </div>
          <h2 class="prompt-spanish">{{ hint.spanish }}</h2>
        </div>

        <form class="tense-inputs" @submit.prevent="handleSubmit">
          <div v-for="tense in tenseOrder" :key="tense" class="input-card">
            <label :for="`room-${tense}`" class="field-label">{{ tenseLabels[tense] }}</label>
            <input
              :id="`room-${tense}`"
              v-model="answers[tense]"
              type="text"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              :disabled="answersLocked"
              placeholder="..."
              class="text-input"
            />
          </div>

          <button type="submit" class="primary-btn" :disabled="answersLocked">
            {{ answersLocked ? 'Esperando al rival…' : 'Enviar respuestas' }}
          </button>
          <p v-if="answersLocked" class="footnote">
            {{ hasAnsweredCurrentRound ? 'Respuestas enviadas.' : 'Enviando…' }}
          </p>
        </form>

        <ul class="live-progress">
          <li v-for="player in players" :key="player.id" class="live-progress-row">
            <span>{{ player.name }}</span>
            <span v-if="playerSubmitted(player.id)" class="answered-tag">contestó</span>
            <span v-else class="waiting-tag">pensando…</span>
          </li>
        </ul>
      </main>

      <!-- Finished -->
      <main v-else class="room-card animate-pop">
        <h1 class="card-title">Partida terminada</h1>
        <p class="card-text">{{ finalWinner }}</p>

        <ul class="player-list">
          <li v-for="player in finished?.players ?? players" :key="player.id" class="player-row">
            <span class="player-name">{{ player.name }}</span>
            <span class="player-score">{{ finished?.scores[player.id] ?? 0 }}</span>
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.85rem;
  border-radius: var(--radius-md);
  background: var(--surface-inset);
  border: 1px solid var(--border-subtle);
}

.score-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  gap: 0.15rem;
}

.score-name {
  font-size: 0.85rem;
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
  font-size: 1.6rem;
  font-weight: 800;
  color: #fff;
}

.score-vs {
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-dim);
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

.result-verb {
  font-size: 0.85rem;
  color: var(--text-muted);
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

.result-forms {
  font-family: var(--font-mono);
  font-size: 0.78rem;
}

.prompt-box {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  text-align: center;
}

.badges {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.badge {
  padding: 0.25rem 0.7rem;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.badge-regular {
  background: rgba(16, 185, 129, 0.15);
  color: #6ee7b7;
  border: 1px solid var(--success-border);
}

.badge-irregular {
  background: rgba(245, 158, 11, 0.15);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.badge-level {
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary-light);
  border: 1px solid rgba(99, 102, 241, 0.35);
}

.prompt-spanish {
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}

.tense-inputs {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.input-card {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.live-progress {
  list-style: none;
  display: flex;
  gap: 1rem;
  justify-content: center;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.live-progress-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.answered-tag {
  color: var(--success);
  font-weight: 700;
}

.waiting-tag {
  color: var(--text-dim);
}
</style>
