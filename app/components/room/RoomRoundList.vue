<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ListRoundPrompt, RoundReply } from '~/core/room-client'

/**
 * Room round for the `list` family (`synonyms`, `antonyms`).
 *
 * The prompt carries the word, its hint and only *how many* accepted items
 * exist, never which ones, so the component renders exactly those three things:
 * the player writes one candidate per row, adds rows up to the announced
 * ceiling and removes them down to one.
 *
 * It never ranks, filters or hints at acceptance — trimming blanks is the only
 * normalisation — and it emits a `RoundReply`; the room machine is
 * authoritative over both grading and closing the round.
 */
const props = defineProps<{
  prompt: ListRoundPrompt
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', reply: RoundReply): void
}>()

/**
 * Identity of the round, derived from the prompt alone.
 *
 * A round component receives no round index, so the prompt's own content is the
 * only way to tell "the next round" from "the same round broadcast again".
 */
function promptIdentity(prompt: ListRoundPrompt): string {
  return [prompt.word, prompt.hint, String(prompt.expectedCount)].join('\u0000')
}

/** The ceiling of rows, never below the single row the player always has. */
const maxRows = computed(() => Math.max(1, props.prompt.expectedCount))

const rows = ref<string[]>([''])
const rowRefs = ref<(HTMLInputElement | null)[]>([])
/** The prompt object this component already answered, so one round sends once. */
const sentFor = ref<ListRoundPrompt | null>(null)
const currentIdentity = ref(promptIdentity(props.prompt))

const canAddRow = computed(() => rows.value.length < maxRows.value)
const canRemoveRow = computed(() => rows.value.length > 1)

/** Trimmed, non-empty items only: a blank row is not an answer. */
const items = computed(() =>
  rows.value.map((row) => row.trim()).filter((row) => row !== '')
)

const canSubmit = computed(() => !props.disabled && items.value.length > 0)

function setRowRef(el: unknown, index: number): void {
  rowRefs.value[index] = el as HTMLInputElement | null
}

function focusRow(index: number): void {
  nextTick(() => rowRefs.value[index]?.focus())
}

function addRow(): void {
  if (props.disabled || !canAddRow.value) return
  rows.value.push('')
  focusRow(rows.value.length - 1)
}

function removeRow(index: number): void {
  if (props.disabled || !canRemoveRow.value) return
  rows.value.splice(index, 1)
  focusRow(Math.max(0, index - 1))
}

/**
 * Enter opens the next row instead of sending: a half-written list must not
 * close the round by accident. Only the submit button sends.
 */
function handleRowEnter(): void {
  if (canAddRow.value) addRow()
}

watch(
  () => props.prompt,
  (next) => {
    const identity = promptIdentity(next)
    // The same round broadcast again keeps what the player already typed: an
    // unchanged prompt means the very same accepted set, so the rows are never
    // stale. A prompt whose identity moved is a new round and starts from one
    // empty row, so last round's list can never be sent again.
    if (identity === currentIdentity.value) return
    currentIdentity.value = identity
    sentFor.value = null
    rows.value = ['']
    rowRefs.value = []
    focusRow(0)
  }
)

function handleSubmit(): void {
  if (!canSubmit.value || sentFor.value === props.prompt) return
  sentFor.value = props.prompt
  emit('submit', { kind: 'list', items: items.value })
}
</script>

<template>
  <section class="list-round">
    <header class="round-meta">
      <span class="badge badge-level">hasta {{ prompt.expectedCount }}</span>
      <span class="hint-badge">Pista: <strong>{{ prompt.hint }}</strong></span>
    </header>

    <div class="prompt-box">
      <span class="prompt-sub">Escribí todas las palabras que se te ocurran para:</span>
      <h2 class="prompt-word">{{ prompt.word }}</h2>
    </div>

    <form class="list-form" @submit.prevent="handleSubmit">
      <ul class="row-list">
        <li v-for="(_entry, index) in rows" :key="index" class="row-item">
          <label :for="`room-list-item-${index}`" class="row-label">
            Respuesta {{ index + 1 }}
          </label>
          <div class="row-controls">
            <input
              :id="`room-list-item-${index}`"
              :ref="(el) => setRowRef(el, index)"
              v-model="rows[index]"
              type="text"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              :disabled="disabled"
              class="list-input"
              placeholder="..."
              @keydown.enter.prevent="handleRowEnter"
            />
            <button
              type="button"
              class="remove-btn"
              :disabled="disabled || !canRemoveRow"
              :aria-label="`Quitar la respuesta ${index + 1}`"
              @click="removeRow(index)"
            >
              ×
            </button>
          </div>
        </li>
      </ul>

      <div class="row-actions">
        <button type="button" class="ghost-btn" :disabled="disabled || !canAddRow" @click="addRow">
          + Agregar otra
        </button>
        <span class="row-counter">{{ rows.length }} de hasta {{ prompt.expectedCount }}</span>
      </div>

      <button type="submit" class="primary-btn" :disabled="!canSubmit">
        {{ disabled ? 'Esperando a los demás…' : 'Enviar respuestas' }}
      </button>
      <p v-if="disabled" class="footnote">Respuestas enviadas.</p>
    </form>
  </section>
</template>

<style scoped>
.list-round {
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

.hint-badge {
  font-size: 0.75rem;
  color: var(--text-dim);
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

.prompt-word {
  font-size: clamp(1.6rem, 4vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  margin-top: 0.2rem;
}

.list-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.row-list {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  list-style: none;
}

.row-item {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.row-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
}

.row-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.list-input {
  flex: 1;
  width: 100%;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-md);
  border: 2px solid var(--border-subtle);
  background: var(--surface-inset);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.list-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
}

.list-input:disabled {
  opacity: 0.75;
  cursor: not-allowed;
}

.remove-btn {
  flex: none;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.remove-btn:hover:not(:disabled) {
  background: var(--error-bg);
  border-color: var(--error-border);
  color: #fecdd3;
}

.remove-btn:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.remove-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
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

.ghost-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.ghost-btn:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.ghost-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.row-counter {
  font-size: 0.75rem;
  color: var(--text-dim);
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
</style>
