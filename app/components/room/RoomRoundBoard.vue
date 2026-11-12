<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { BoardRoundPrompt, BoardStep, RoundReply } from '~/core/room-client'

/**
 * Room round for the `board` family (`card-matching`): one shared board that
 * every player sees, played in turns.
 *
 * The prompt carries the whole board (every card, always visible), the step the
 * player on turn must pick next, whose turn it is and the chain tally. The
 * component renders exactly that: the cards in the order the server dealt them,
 * the step, the turn and the tally. It never sorts, groups, filters or shuffles
 * the cards, never assumes two similar labels belong together, and never grades
 * locally — the card id is opaque and is only ever echoed back.
 *
 * It emits a `RoundReply`; the room machine is authoritative.
 */
const props = defineProps<{
  prompt: BoardRoundPrompt
  disabled?: boolean
  /** Player id -> display name. Optional: ids are the only true identity. */
  playerNames?: Record<string, string>
  /** The local player, whose turn decides whether the board is playable. */
  selfId?: string
}>()

const emit = defineEmits<{
  (e: 'submit', reply: RoundReply): void
}>()

/**
 * The step names the app already uses, copied verbatim from `CardMatching.vue`
 * (`stageTitle`, lines "Paso 2/3/4") and from the practice screens.
 */
const stepInstructions: Record<BoardStep, string> = {
  spanish: 'Paso 1: Elige un verbo en español',
  base: 'Paso 2: Selecciona el Infinitivo (Base)',
  past: 'Paso 3: Selecciona el Pasado Simple',
  participle: 'Paso 4: Selecciona el Participio Pasado',
}

/** Short form of the same wording, for the card stage tag. */
const stepLabels: Record<BoardStep, string> = {
  spanish: 'Español',
  base: 'Infinitivo',
  past: 'Pasado',
  participle: 'Participio',
}

/**
 * Identity of the board, derived from the prompt alone.
 *
 * A round component receives no round index, so the prompt's own content is the
 * only way to tell "the next board" from "the same board broadcast again".
 * `completedChains` is part of it because closing a chain can leave the step and
 * the turn unchanged.
 */
function promptIdentity(prompt: BoardRoundPrompt): string {
  const cards = prompt.cards.map((card) => `${card.id}:${card.label}`).join(',')
  return [
    cards,
    prompt.needed,
    prompt.turnPlayerId,
    String(prompt.completedChains),
    String(prompt.totalChains),
  ].join('\u0000')
}

const selectedId = ref<string | null>(null)
const currentIdentity = ref(promptIdentity(props.prompt))
/** The identity this component already answered, so one board sends once. */
const sentIdentity = ref<string | null>(null)

const answered = computed(() => sentIdentity.value === currentIdentity.value)

/** A missing `selfId` can never be the player on turn. */
const isMyTurn = computed(
  () => props.selfId !== undefined && props.prompt.turnPlayerId === props.selfId
)

/** The board accepts input only on your turn, unlocked and not already sent. */
const interactive = computed(
  () => isMyTurn.value && props.disabled !== true && !answered.value
)

const canSubmit = computed(() => interactive.value && selectedId.value !== null)

function nameOf(playerId: string): string | null {
  const name = props.playerNames?.[playerId]
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null
}

/** Never show a raw id: an unknown player gets the neutral wording. */
const turnPlayerName = computed(() => nameOf(props.prompt.turnPlayerId))

// `selfId === undefined` never reaches the first branch: `isMyTurn` is already
// false there, so the player simply sees someone else's turn.
const turnNotice = computed(() => {
  if (isMyTurn.value) return 'Es tu turno'
  return turnPlayerName.value ? `Turno de ${turnPlayerName.value}` : 'Turno de otro jugador'
})

const statusText = computed(() => {
  if (props.disabled === true || answered.value) {
    return 'Respuesta enviada. Esperando el próximo paso…'
  }
  if (!isMyTurn.value) {
    return `Esperá tu turno para elegir la carta del ${stepLabels[props.prompt.needed].toLowerCase()}.`
  }
  return ''
})

/** The tally in the order the server sent it, never reordered or sorted. */
const chainTally = computed(() =>
  Object.entries(props.prompt.chainsBy).map(([playerId, chains]) => {
    const name = playerId === props.selfId ? 'Vos' : nameOf(playerId)
    return {
      playerId,
      name: name ?? 'Jugador',
      chains,
      mine: playerId === props.selfId,
    }
  })
)

function selectCard(cardId: string): void {
  if (!interactive.value) return
  // One card at a time; picking the selected card again clears it.
  selectedId.value = selectedId.value === cardId ? null : cardId
}

watch(
  () => props.prompt,
  (next) => {
    const identity = promptIdentity(next)
    // The same board broadcast again keeps the pending selection: an unchanged
    // prompt means the very same cards, so the selection is never stale. A
    // prompt whose identity moved is a new board and clears it, so last board's
    // card can never be sent again.
    if (identity === currentIdentity.value) return
    currentIdentity.value = identity
    sentIdentity.value = null
    selectedId.value = null
  }
)

function handleSubmit(): void {
  if (!canSubmit.value || selectedId.value === null) return
  // Marked before emitting: a double click in the same tick cannot send twice.
  sentIdentity.value = currentIdentity.value
  emit('submit', { kind: 'board', cardId: selectedId.value })
}
</script>

<template>
  <section class="board-round">
    <header class="round-meta">
      <span class="badge badge-level">
        Cadenas completadas: {{ prompt.completedChains }} de {{ prompt.totalChains }}
      </span>
      <ul v-if="chainTally.length > 0" class="chain-tally">
        <li
          v-for="entry in chainTally"
          :key="entry.playerId"
          class="chain-tally-item"
          :class="{ 'chain-tally-item--mine': entry.mine }"
        >
          <span class="chain-tally-name">{{ entry.name }}</span>
          <span class="chain-tally-count">{{ entry.chains }}</span>
        </li>
      </ul>
    </header>

    <div class="prompt-box">
      <span class="prompt-sub">Paso actual</span>
      <h2 class="prompt-step">{{ stepInstructions[prompt.needed] }}</h2>
      <p
        class="turn-notice"
        :class="{ 'turn-notice--mine': isMyTurn }"
        aria-live="polite"
      >
        {{ turnNotice }}
      </p>
    </div>

    <form class="board-form" @submit.prevent="handleSubmit">
      <fieldset class="card-grid" :disabled="!interactive">
        <legend class="card-legend">Cartas del tablero</legend>
        <button
          v-for="card in prompt.cards"
          :key="card.id"
          type="button"
          class="board-card"
          :class="{ 'board-card--selected': selectedId === card.id }"
          :aria-pressed="selectedId === card.id"
          :disabled="!interactive"
          @click="selectCard(card.id)"
        >
          <span class="card-text">{{ card.label }}</span>
        </button>
      </fieldset>

      <button type="submit" class="primary-btn" :disabled="!canSubmit">
        Enviar carta
      </button>
      <p v-if="statusText" class="footnote">{{ statusText }}</p>
    </form>
  </section>
</template>

<style scoped>
.board-round {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.round-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.badge {
  padding: 0.25rem 0.7rem;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.badge-level {
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary-light);
  border: 1px solid rgba(99, 102, 241, 0.35);
}

.chain-tally {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  list-style: none;
}

.chain-tally-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
}

.chain-tally-item--mine {
  border-color: rgba(99, 102, 241, 0.35);
  color: #c7d2fe;
}

.chain-tally-count {
  font-family: var(--font-mono);
  font-weight: 800;
  color: #fff;
}

.prompt-box {
  text-align: center;
}

.prompt-sub {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.prompt-step {
  font-size: clamp(1.2rem, 3.4vw, 1.6rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  margin-top: 0.2rem;
}

.turn-notice {
  margin-top: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
}

.turn-notice--mine {
  color: var(--primary-light);
}

.board-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  border: none;
  padding: 0;
  margin: 0;
}

@media (max-width: 550px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.card-legend {
  padding: 0;
  margin-bottom: 0.6rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.board-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 95px;
  padding: 1rem 0.75rem;
  background: var(--surface-inset);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-main);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease,
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.card-text {
  font-size: 1.15rem;
  font-weight: 700;
  font-family: var(--font-mono);
  /* `break-word`, not `word-break: break-word`: long labels like
     "reportar/informar" must break at the slash, not in the middle of a word. */
  overflow-wrap: break-word;
  word-break: normal;
}

.board-card:hover:enabled {
  border-color: rgba(99, 102, 241, 0.6);
  background: rgba(99, 102, 241, 0.12);
  transform: translateY(-2px);
}

.board-card:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
}

.board-card--selected {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.16);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.35);
}

.card-grid:disabled .board-card {
  cursor: not-allowed;
  opacity: 0.7;
}

.card-grid:disabled .board-card:hover {
  border-color: var(--border-subtle);
  background: var(--surface-inset);
  transform: none;
}

.card-grid:disabled .board-card--selected {
  opacity: 1;
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.16);
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
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.primary-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glow);
}

.primary-btn:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
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

@media (max-width: 560px) {
  .card-grid {
    gap: 0.65rem;
  }

  .board-card {
    min-height: 84px;
    padding: 0.85rem 0.5rem;
  }

  .card-text {
    font-size: 0.95rem;
  }
}
</style>
