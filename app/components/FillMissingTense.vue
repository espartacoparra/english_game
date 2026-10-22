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

const tenseLabels: Record<TenseKey, { label: string; desc: string }> = {
  base: { label: 'Infinitivo (Base)', desc: 'Forma base' },
  past: { label: 'Pasado Simple', desc: 'Acción completada' },
  participle: { label: 'Participio Pasado', desc: 'Tiempos perfectos' },
}

const tenseOrder: TenseKey[] = ['base', 'past', 'participle']

const inputRefs = ref<Record<string, HTMLInputElement | null>>({})

function setInputRef(el: unknown, tense: string) {
  inputRefs.value[tense] = el as HTMLInputElement | null
}

// Rotate which tense is given vs missing
const givenTense = computed<TenseKey>(() => {
  return tenseOrder[currentIndex.value % tenseOrder.length]
})

const progressPercent = computed(() => {
  if (!selectedVerbs.value.length) return 0
  return Math.round(((currentIndex.value + 1) / selectedVerbs.value.length) * 100)
})

function resetForVerb() {
  const verb = currentVerb.value
  if (!verb) return

  answers.value = {
    base: '',
    past: '',
    participle: '',
  }
  answers.value[givenTense.value] = verb[givenTense.value]

  feedback.value = { base: null, past: null, participle: null }
  hasSubmitted.value = false
  allCorrect.value = false
  showShake.value = false

  nextTick(() => {
    const targetTense = tenseOrder.find((t) => t !== givenTense.value)
    if (targetTense && inputRefs.value[targetTense]) {
      inputRefs.value[targetTense]?.focus()
    }
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
</script>

<template>
  <div class="game-wrapper">
    <!-- Top Header -->
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

    <!-- Main Card -->
    <main v-if="!isFinished && currentVerb" class="game-card animate-pop" :class="{ 'animate-shake': showShake }">
      <!-- Verb Meta -->
      <div class="verb-meta">
        <div class="badges">
          <span class="badge" :class="currentVerb.type === 'irregular' ? 'badge-irregular' : 'badge-regular'">
            {{ currentVerb.type === 'irregular' ? 'Irregular' : 'Regular' }}
          </span>
          <span class="badge badge-level">Nivel {{ currentVerb.level }}</span>
        </div>

        <div class="hint-badge">
          <span>Pista provista: <strong>{{ tenseLabels[givenTense].label }}</strong></span>
        </div>
      </div>

      <!-- Spanish Prompt -->
      <div class="prompt-box">
        <span class="prompt-sub">Completa los tiempos que faltan para:</span>
        <h2 class="prompt-spanish">{{ currentVerb.spanish }}</h2>
      </div>

      <!-- Tense Rows -->
      <form class="tense-inputs" @submit.prevent="handleNext">
        <div
          v-for="tense in tenseOrder"
          :key="tense"
          class="input-card"
          :class="{ 'input-card--given': tense === givenTense }"
        >
          <div class="input-header">
            <label :for="`fill-${tense}`" class="tense-title">
              {{ tenseLabels[tense].label }}
              <span v-if="tense === givenTense" class="given-pill">Pista provista</span>
            </label>
            <span class="tense-desc">{{ tenseLabels[tense].desc }}</span>
          </div>

          <div class="input-row">
            <input
              :id="`fill-${tense}`"
              :ref="(el) => setInputRef(el, tense)"
              v-model="answers[tense]"
              type="text"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              :disabled="hasSubmitted || tense === givenTense"
              class="tense-input-field"
              :class="{
                'input-given': tense === givenTense,
                'input-correct': feedback[tense]?.correct,
                'input-wrong': feedback[tense] && !feedback[tense]?.correct,
              }"
              :placeholder="tense === givenTense ? '' : 'Escribe el tiempo...'"
            />
          </div>

          <!-- Error correction banner -->
          <div v-if="feedback[tense] && !feedback[tense]?.correct" class="correction-banner">
            <span class="correction-icon">✕</span>
            <span>Correcto: <strong>{{ feedback[tense]?.correctValue }}</strong></span>
          </div>
        </div>

        <button class="submit-btn" type="submit">
          {{ hasSubmitted ? 'Siguiente verbo →' : 'Comprobar respuesta' }}
        </button>
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
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.badges {
  display: flex;
  gap: 0.5rem;
}

.hint-badge {
  font-size: 0.775rem;
  color: #c7d2fe;
  background: rgba(99, 102, 241, 0.12);
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius-full);
  border: 1px solid rgba(99, 102, 241, 0.25);
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
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.given-pill {
  font-size: 0.675rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: var(--radius-full);
  background: rgba(99, 102, 241, 0.2);
  color: #c7d2fe;
}

.tense-desc {
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

.tense-input-field.input-given {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.3);
  color: #c7d2fe;
  font-weight: 700;
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
  opacity: 0.9;
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

.submit-btn {
  margin-top: 1rem;
  padding: 0.9rem 1.5rem;
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
