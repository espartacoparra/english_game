<script setup lang="ts">
import type { TenseKey } from '~/types/verb'

const { currentVerb, selectedVerbs, currentIndex, isFinished, submitAnswers, score } = useVerbGame()

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

const tenseLabels: Record<TenseKey, string> = {
  base: 'Infinitivo',
  past: 'Pasado',
  participle: 'Participio',
}

const tenseOrder: TenseKey[] = ['base', 'past', 'participle']

const progressText = computed(() => {
  if (!selectedVerbs.value.length) return ''
  return `Verbo ${currentIndex.value + 1} de ${selectedVerbs.value.length}`
})

const givenTense = computed<TenseKey>(() => {
  return tenseOrder[currentIndex.value % tenseOrder.length]
})

const givenTenseLabel = computed(() => tenseLabels[givenTense.value])

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
    const isCorrect =
      answers.value[tense].trim().toLowerCase() === verb[tense].trim().toLowerCase()
    newFeedback[tense] = {
      correct: isCorrect,
      correctValue: verb[tense],
    }
    if (isCorrect) correctCount++
  }

  feedback.value = newFeedback
  hasSubmitted.value = true
  allCorrect.value = correctCount === 3
}

function handleNext() {
  if (!hasSubmitted.value) {
    validateAnswers()
    return
  }

  submitAnswers(answers.value)
}
</script>

<template>
  <div class="game-card">
    <p class="progress">{{ progressText }}</p>

    <template v-if="!isFinished && currentVerb">
      <h2 class="prompt">Escribe los tiempos de: {{ currentVerb.spanish }}</h2>
      <p class="given-hint">
        Tiempo dado: {{ givenTenseLabel }} → {{ currentVerb[givenTense] }}
      </p>

      <div class="inputs">
        <div v-for="tense in tenseOrder" :key="tense" class="input-group">
          <label :for="tense">{{ tenseLabels[tense] }}</label>
          <input
            :id="tense"
            v-model="answers[tense]"
            type="text"
            :disabled="hasSubmitted || tense === givenTense"
            :class="{
              correct: feedback[tense]?.correct,
              wrong: feedback[tense] && !feedback[tense]?.correct,
            }"
            @keyup.enter="handleNext"
          />
          <p v-if="feedback[tense] && !feedback[tense]?.correct" class="correction">
            Correcto: {{ feedback[tense]?.correctValue }}
          </p>
        </div>
      </div>

      <p v-if="hasSubmitted" class="feedback" :class="{ success: allCorrect, error: !allCorrect }">
        {{ allCorrect ? '¡Correcto!' : 'Revisa los errores' }}
      </p>

      <button class="primary-button" @click="handleNext">
        {{ hasSubmitted ? 'Continuar' : 'Siguiente' }}
      </button>
    </template>

    <template v-else>
      <div class="completion">
        <h2>¡Sesión terminada!</h2>
        <p>Puntuación: {{ score }} de {{ selectedVerbs.length }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.game-card {
  max-width: 480px;
  margin: 2rem auto;
  padding: 1.5rem;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.progress {
  margin: 0 0 1rem;
  color: #666;
  font-size: 0.9rem;
  text-align: center;
}

.prompt {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  text-align: center;
  color: #222;
}

.given-hint {
  margin: 0 0 1.5rem;
  text-align: center;
  color: #555;
  font-size: 0.95rem;
}

.inputs {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

label {
  font-weight: 600;
  color: #444;
  font-size: 0.95rem;
}

input {
  padding: 0.65rem 0.75rem;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s, background-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #3b82f6;
}

input.correct {
  border-color: #22c55e;
  background-color: #f0fdf4;
}

input.wrong {
  border-color: #ef4444;
  background-color: #fef2f2;
}

input:disabled {
  opacity: 0.9;
  cursor: not-allowed;
}

.correction {
  margin: 0;
  font-size: 0.85rem;
  color: #dc2626;
}

.feedback {
  text-align: center;
  font-weight: 600;
  margin: 0 0 1rem;
}

.feedback.success {
  color: #16a34a;
}

.feedback.error {
  color: #dc2626;
}

.primary-button {
  width: 100%;
  padding: 0.75rem;
  border: none;
  border-radius: 8px;
  background: #3b82f6;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.primary-button:hover {
  background: #2563eb;
}

.completion {
  text-align: center;
  color: #222;
}

.completion h2 {
  margin: 0 0 0.5rem;
}

.completion p {
  margin: 0;
  font-size: 1.1rem;
}
</style>
