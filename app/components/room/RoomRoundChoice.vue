<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChoiceRoundPrompt, RoundReply } from '~/core/room-client'

/**
 * Room round for the `choice` family (`cognates`, `false-cognates`).
 *
 * The prompt carries the item, the question, an optional hint and the options
 * the server already decided, so the component renders them in the given order
 * and nothing else: no shuffle, no reorder, no filtering, no local grading.
 *
 * It emits a `RoundReply`; the room machine is authoritative.
 */
const props = defineProps<{
  prompt: ChoiceRoundPrompt
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
function promptIdentity(prompt: ChoiceRoundPrompt): string {
  const options = prompt.options.map((option) => `${option.id}:${option.label}`).join(',')
  return [prompt.item, prompt.question, prompt.hint ?? '', options].join('\u0000')
}

const selectedId = ref<string | null>(null)
/** The prompt object this component already answered, so one round sends once. */
const sentFor = ref<ChoiceRoundPrompt | null>(null)
const currentIdentity = ref(promptIdentity(props.prompt))

const canSubmit = computed(() => !props.disabled && selectedId.value !== null)

function select(optionId: string): void {
  if (props.disabled) return
  selectedId.value = optionId
}

watch(
  () => props.prompt,
  (next) => {
    const identity = promptIdentity(next)
    // The same round broadcast again keeps the pending selection: an unchanged
    // prompt means the very same options, so the selection is never stale. A
    // prompt whose identity moved is a new round and clears it, so last round's
    // option can never be sent again.
    if (identity === currentIdentity.value) return
    currentIdentity.value = identity
    sentFor.value = null
    selectedId.value = null
  }
)

function handleSubmit(): void {
  if (!canSubmit.value || selectedId.value === null) return
  if (sentFor.value === props.prompt) return
  sentFor.value = props.prompt
  emit('submit', { kind: 'choice', optionId: selectedId.value })
}
</script>

<template>
  <section class="choice-round">
    <header v-if="prompt.hint" class="round-meta">
      <span class="hint-badge">Pista: <strong>{{ prompt.hint }}</strong></span>
    </header>

    <div class="prompt-box">
      <span class="prompt-sub">Elegí la opción correcta para:</span>
      <h2 class="prompt-item">{{ prompt.item }}</h2>
      <p class="prompt-question">{{ prompt.question }}</p>
    </div>

    <form class="choice-form" @submit.prevent="handleSubmit">
      <fieldset class="option-set" :disabled="disabled">
        <legend class="option-legend">Opciones</legend>
        <label
          v-for="option in prompt.options"
          :key="option.id"
          class="option"
          :class="{ 'option--selected': selectedId === option.id }"
        >
          <input
            class="option-input"
            type="radio"
            name="room-choice-option"
            :value="option.id"
            :checked="selectedId === option.id"
            :disabled="disabled"
            @change="select(option.id)"
          />
          <span class="option-mark" aria-hidden="true" />
          <span class="option-label">{{ option.label }}</span>
        </label>
      </fieldset>

      <button type="submit" class="primary-btn" :disabled="!canSubmit">
        {{ disabled ? 'Esperando a los demás…' : 'Enviar respuesta' }}
      </button>
      <p v-if="disabled" class="footnote">Respuesta enviada.</p>
    </form>
  </section>
</template>

<style scoped>
.choice-round {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.round-meta {
  display: flex;
  align-items: center;
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

.prompt-item {
  font-size: clamp(1.6rem, 4vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  margin-top: 0.2rem;
}

.prompt-question {
  margin-top: 0.35rem;
  font-size: 0.95rem;
  color: var(--text-muted);
}

.choice-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.option-set {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border: none;
  padding: 0;
  margin: 0;
}

.option-legend {
  padding: 0;
  margin-bottom: 0.1rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.option {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-md);
  border: 2px solid var(--border-subtle);
  background: var(--surface-inset);
  color: var(--text-main);
  font-size: 0.95rem;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.option:hover {
  border-color: rgba(129, 140, 248, 0.55);
}

/* The radio stays focusable but invisible; its label carries the focus ring. */
.option-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.option-mark {
  flex: none;
  width: 1.05rem;
  height: 1.05rem;
  border-radius: var(--radius-full);
  border: 2px solid var(--border-subtle);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.option-label {
  flex: 1;
  word-break: break-word;
}

.option:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
}

.option--selected {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.16);
}

.option--selected .option-mark {
  border-color: var(--primary-light);
  box-shadow: inset 0 0 0 3px var(--primary);
}

.option-set:disabled .option {
  cursor: not-allowed;
  opacity: 0.8;
}

.option-set:disabled .option:hover {
  border-color: var(--border-subtle);
}

.option-set:disabled .option--selected {
  border-color: var(--primary);
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
