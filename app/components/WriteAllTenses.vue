<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useVerbGame } from '~/composables/useVerbGame'
import type { TenseKey } from '~/types/verb'

const {
  currentVerb,
  selectedVerbs,
  currentIndex,
  isFinished,
  recordResult,
  score,
  streak,
  resetGame,
  normalizedCompare,
} = useVerbGame()

interface TenseFeedback {
  correct: boolean
  correctValue: string
}

const answers = ref<Record<TenseKey, string>>({
  base: '',
  past: '',
  participle: '',
})

const feedback = ref<Record<TenseKey, TenseFeedback | null>>({
  base: null,
  past: null,
  participle: null,
})

const hasSubmitted = ref(false)
const allCorrect = ref(false)
const showShake = ref(false)

const tenseLabels: Record<TenseKey, { label: string; example: string }> = {
  base: { label: 'Infinitivo (Base)', example: 'ej. write' },
  past: { label: 'Pasado Simple (Past)', example: 'ej. wrote' },
  participle: { label: 'Participio Pasado (Participle)', example: 'ej. written' },
}

const tenseOrder: TenseKey[] = ['base', 'past', 'participle']

const inputRefs = ref<Record<string, HTMLInputElement | null>>({})

function setInputRef(el: unknown, tense: string) {
  inputRefs.value[tense] = el as HTMLInputElement | null
}

const progressPercent = computed(() => {
  if (!selectedVerbs.value.length) return 0
  return Math.round(((currentIndex.value + 1) / selectedVerbs.value.length) * 100)
})

function resetForVerb() {
  answers.value = { base: '', past: '', participle: '' }
  feedback.value = { base: null, past: null, participle: null }
  hasSubmitted.value = false
  allCorrect.value = false
  showShake.value = false

  nextTick(() => {
    inputRefs.value['base']?.focus()
  })
}

watch(currentVerb, resetForVerb, { immediate: true })

function validateAnswers() {
  const verb = currentVerb.value
  if (!verb) return

  let correctCount = 0
  const newFeedback: Record<TenseKey, TenseFeedback | null> = {
    base: null,
    past: null,
    participle: null,
  }

  for (const tense of tenseOrder) {
    const isCorrect = normalizedCompare(answers.value[tense], verb[tense])
    newFeedback[tense] = {
      correct: isCorrect,
      correctValue: verb[tense],
    }
    if (isCorrect) correctCount++
  }

  feedback.value = newFeedback
  hasSubmitted.value = true
  allCorrect.value = correctCount === 3

  if (!allCorrect.value) {
    showShake.value = true
    setTimeout(() => {
      showShake.value = false
    }, 500)
  }
}

function handleNext() {
  if (!hasSubmitted.value) {
    validateAnswers()
    return
  }

  const verb = currentVerb.value
  if (!verb) return

  recordResult({
    verb,
    correct: allCorrect.value,
    userAnswers: { ...answers.value },
  })
}

function giveUpHint() {
  const verb = currentVerb.value
  if (!verb) return

  answers.value = {
    base: verb.base,
    past: verb.past,
    participle: verb.participle,
  }
  validateAnswers()
  allCorrect.value = false // Not counting as solved alone
}
</script>

<template>
  <div class="game-wrapper">
    <!-- Top Bar Controls -->
    <header class="game-header">
      <button class="exit-btn" type="button" @click="resetGame">
        ← Menú principal
      </button>

      <div class="header-center">
        <div class="progress-info">
          <span>Verbo {{ currentIndex + 1 }} de {{ selectedVerbs.length }}</span>
          <span class="score-display">Puntos: {{ score }}</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
      </div>

      <div class="streak-container">
        <span v-if="streak > 1" class="streak-pill">
          🔥 {{ streak }} racha
        </span>
      </div>
    </header>

    <!-- Main Game Card -->
    <main v-if="!isFinished && currentVerb" class="game-card animate-pop" :class="{ 'animate-shake': showShake }">
      <!-- Verb Header Info -->
      <div class="verb-meta">
        <div class="badges">
          <span class="badge" :class="currentVerb.type === 'irregular' ? 'badge-irregular' : 'badge-regular'">
            {{ currentVerb.type === 'irregular' ? 'Irregular' : 'Regular' }}
          </span>
          <span class="badge badge-level">Nivel {{ currentVerb.level }}</span>
        </div>
      </div>

      <!-- Prompt -->
      <div class="prompt-box">
        <span class="prompt-sub">Escribe los 3 tiempos del verbo en inglés:</span>
        <h2 class="prompt-spanish">{{ currentVerb.spanish }}</h2>
      </div>

      <!-- Inputs for the 3 tenses -->
      <form class="tense-inputs" @submit.prevent="handleNext">
        <div v-for="tense in tenseOrder" :key="tense" class="input-card">
          <div class="input-header">
            <label :for="`tense-${tense}`" class="tense-title">
              {{ tenseLabels[tense].label }}
            </label>
            <span class="tense-example">{{ tenseLabels[tense].example }}</span>
          </div>

          <div class="input-row">
            <input
              :id="`tense-${tense}`"
              :ref="(el) => setInputRef(el, tense)"
              v-model="answers[tense]"
              type="text"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              :disabled="hasSubmitted"
              class="tense-input-field"
              :class="{
                'input-correct': feedback[tense]?.correct,
                'input-wrong': feedback[tense] && !feedback[tense]?.correct,
              }"
              placeholder="..."
            />
          </div>

          <!-- Error / Correction display -->
          <div v-if="feedback[tense] && !feedback[tense]?.correct" class="correction-banner">
            <span class="correction-icon">✕</span>
            <span>Respuesta correcta: <strong>{{ feedback[tense]?.correctValue }}</strong></span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="actions-footer">
          <button
            v-if="!hasSubmitted"
            type="button"
            class="hint-btn"
            @click="giveUpHint"
          >
            💡 Ver respuesta
          </button>

          <button class="submit-btn" type="submit">
            {{ hasSubmitted ? 'Siguiente verbo →' : 'Comprobar respuesta' }}
          </button>
        </div>
      </form>
    </main>
  </div>
</template>

<style scoped>
.game-wrapper {
  max-width: 680px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}

/* Header */
.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
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
  cursor: pointer;
  transition: all 0.2s ease;
}

.exit-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.header-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
}

.score-display {
  color: var(--primary-light);
}

.progress-bar-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: var(--primary-gradient);
  border-radius: var(--radius-full);
  transition: width 0.3s ease;
}

.streak-container {
  min-width: 90px;
  text-align: right;
}

.streak-pill {
  display: inline-block;
  padding: 0.3rem 0.75rem;
  background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
  color: #fff;
  border-radius: var(--radius-full);
  font-size: 0.775rem;
  font-weight: 800;
  box-shadow: 0 0 15px rgba(245, 158, 11, 0.3);
}

/* Card */
.game-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 2rem;
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-card);
}

@media (max-width: 500px) {
  .game-card {
    padding: 1.25rem;
  }
}

.verb-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.badges {
  display: flex;
  gap: 0.5rem;
}

.prompt-box {
  text-align: center;
  margin-bottom: 2rem;
}

.prompt-sub {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.prompt-spanish {
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  font-weight: 800;
  color: #fff;
  margin-top: 0.25rem;
  letter-spacing: -0.02em;
}

/* Inputs */
.tense-inputs {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
}

.input-card {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.input-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.tense-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-main);
}

.tense-example {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.input-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tense-input-field {
  flex: 1;
  padding: 0.85rem 1rem;
  background: var(--surface-inset);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 1.05rem;
  font-family: var(--font-mono);
  outline: none;
  transition: all 0.2s ease;
}

.tense-input-field:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
}

.tense-input-field.input-correct {
  border-color: var(--success);
  background: var(--success-bg);
  color: #a7f3d0;
}

.tense-input-field.input-wrong {
  border-color: var(--error);
  background: var(--error-bg);
  color: #fecdd3;
}

.tense-input-field:disabled {
  opacity: 0.85;
  cursor: default;
}

.correction-banner {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.35rem;
  padding: 0.45rem 0.75rem;
  background: var(--error-bg);
  border-radius: var(--radius-sm);
  color: #fecdd3;
  font-size: 0.825rem;
}

.correction-icon {
  font-weight: 900;
  color: var(--error);
}

/* Actions Footer */
.actions-footer {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

.hint-btn {
  padding: 0.85rem 1.25rem;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.hint-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.submit-btn {
  flex: 1;
  padding: 0.85rem 1.5rem;
  background: var(--primary-gradient);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  box-shadow: 0 6px 20px var(--primary-glow);
  transition: all 0.2s ease;
}

.submit-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
</style>
