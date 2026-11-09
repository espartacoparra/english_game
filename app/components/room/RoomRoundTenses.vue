<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { RoundReply, TenseRoundPrompt } from '~/core/room-client'
import type { TenseKey } from '~/types/verb'

/**
 * Room round for the `tenses` family: `write-all` when the prompt reveals no
 * form, `fill-missing` when it does.
 *
 * The component is driven entirely by the prompt. It renders only what the
 * server sent (the Spanish verb, its type and level, and at most one given
 * form) and emits a `RoundReply`; it never grades anything locally, because
 * the room machine is authoritative.
 */
const props = defineProps<{
  prompt: TenseRoundPrompt
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', reply: RoundReply): void
}>()

const tenseOrder: TenseKey[] = ['base', 'past', 'participle']

const tenseLabels: Record<TenseKey, { label: string; example: string }> = {
  base: { label: 'Infinitivo (Base)', example: 'ej. write' },
  past: { label: 'Pasado Simple (Past)', example: 'ej. wrote' },
  participle: { label: 'Participio Pasado (Participle)', example: 'ej. written' },
}

const answers = ref<Record<TenseKey, string>>({ base: '', past: '', participle: '' })
const inputRefs = ref<Record<string, HTMLInputElement | null>>({})

function setInputRef(el: unknown, tense: string) {
  inputRefs.value[tense] = el as HTMLInputElement | null
}

/** The one form the prompt already reveals, or `null` for `write-all`. */
const givenTense = computed<TenseKey | null>(() => props.prompt.givenTense)

const editableTenses = computed(() => tenseOrder.filter((tense) => tense !== givenTense.value))

const isFillMissing = computed(() => givenTense.value !== null)

const givenTenseLabel = computed(() =>
  givenTense.value ? tenseLabels[givenTense.value].label : ''
)

const canSubmit = computed(
  () =>
    !props.disabled &&
    editableTenses.value.some((tense) => answers.value[tense].trim() !== '')
)

function resetForPrompt() {
  answers.value = { base: '', past: '', participle: '' }
  const given = props.prompt.givenTense
  if (given !== null && props.prompt.givenForm !== null) {
    answers.value[given] = props.prompt.givenForm
  }

  nextTick(() => {
    const target = editableTenses.value[0]
    if (target) inputRefs.value[target]?.focus()
  })
}

watch(() => props.prompt, resetForPrompt, { immediate: true })

function handleSubmit() {
  if (!canSubmit.value) return
  emit('submit', { kind: 'tenses', answers: { ...answers.value } })
}
</script>

<template>
  <section class="tenses-round">
    <header class="round-meta">
      <div class="badges">
        <span
          class="badge"
          :class="prompt.type === 'irregular' ? 'badge-irregular' : 'badge-regular'"
        >
          {{ prompt.type === 'irregular' ? 'Irregular' : 'Regular' }}
        </span>
        <span class="badge badge-level">Nivel {{ prompt.level }}</span>
      </div>
      <span v-if="givenTense" class="hint-badge">
        Pista: <strong>{{ givenTenseLabel }}</strong>
      </span>
    </header>

    <div class="prompt-box">
      <span class="prompt-sub">
        {{ isFillMissing ? 'Completá los tiempos que faltan para:' : 'Escribí los 3 tiempos de:' }}
      </span>
      <h2 class="prompt-spanish">{{ prompt.spanish }}</h2>
    </div>

    <form class="tense-inputs" @submit.prevent="handleSubmit">
      <div
        v-for="tense in tenseOrder"
        :key="tense"
        class="input-card"
        :class="{ 'input-card--given': tense === givenTense }"
      >
        <div class="input-header">
          <label :for="`room-tense-${tense}`" class="tense-title">
            {{ tenseLabels[tense].label }}
            <span v-if="tense === givenTense" class="given-pill">Pista</span>
          </label>
          <span class="tense-example">{{ tenseLabels[tense].example }}</span>
        </div>

        <input
          :id="`room-tense-${tense}`"
          :ref="(el) => setInputRef(el, tense)"
          v-model="answers[tense]"
          type="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          :disabled="disabled || tense === givenTense"
          class="tense-input-field"
          :class="{ 'input-given': tense === givenTense }"
          placeholder="..."
        />
      </div>

      <button type="submit" class="primary-btn" :disabled="!canSubmit">
        {{ disabled ? 'Esperando a los demás…' : 'Enviar respuestas' }}
      </button>
      <p v-if="disabled" class="footnote">Respuestas enviadas.</p>
    </form>
  </section>
</template>

<style scoped>
.tenses-round {
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

.badges {
  display: flex;
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

.prompt-spanish {
  font-size: clamp(1.6rem, 4vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  margin-top: 0.2rem;
}

.tense-inputs {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.input-card {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.input-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}

.tense-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
}

.given-pill {
  margin-left: 0.4rem;
  padding: 0.1rem 0.45rem;
  border-radius: var(--radius-full);
  background: rgba(99, 102, 241, 0.2);
  color: var(--primary-light);
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
}

.tense-example {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.tense-input-field {
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

.tense-input-field:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
}

.tense-input-field.input-given {
  color: var(--primary-light);
  border-style: dashed;
}

.tense-input-field:disabled {
  opacity: 0.75;
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
</style>
