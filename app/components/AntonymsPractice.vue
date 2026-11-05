<script setup lang="ts">
import { computed, ref } from 'vue'

interface AntonymWord {
  word: string
  antonyms: string[]
  hint?: string
}

const words: AntonymWord[] = [
  { word: 'hot', antonyms: ['cold', 'cool', 'chilly', 'icy', 'frigid'], hint: 'caliente' },
  { word: 'big', antonyms: ['small', 'little', 'tiny', 'miniature'], hint: 'grande' },
  { word: 'happy', antonyms: ['sad', 'unhappy', 'miserable', 'gloomy', 'depressed'], hint: 'feliz' },
  { word: 'fast', antonyms: ['slow', 'sluggish', 'leisurely'], hint: 'rápido' },
  { word: 'good', antonyms: ['bad', 'evil', 'terrible', 'awful', 'horrible'], hint: 'bueno' },
  { word: 'old', antonyms: ['new', 'young', 'modern', 'fresh'], hint: 'viejo' },
  { word: 'rich', antonyms: ['poor', 'broke', 'penniless', 'needy'], hint: 'rico' },
  { word: 'strong', antonyms: ['weak', 'feeble', 'frail', 'fragile'], hint: 'fuerte' },
  { word: 'clean', antonyms: ['dirty', 'filthy', 'grimy', 'unclean'], hint: 'limpio' },
  { word: 'easy', antonyms: ['hard', 'difficult', 'tough', 'challenging'], hint: 'fácil' },
]

const currentIndex = ref(0)
const userInput = ref('')
const userAntonyms = ref<string[]>([])
const showAnswer = ref(false)
const score = ref(0)

const currentWord = computed(() => words[currentIndex.value])
const progressPercent = computed(() => Math.round(((currentIndex.value + 1) / words.length) * 100))

function addAntonym() {
  const antonym = userInput.value.trim().toLowerCase()
  if (!antonym) return
  if (!userAntonyms.value.includes(antonym)) {
    userAntonyms.value.push(antonym)
  }
  userInput.value = ''
}

function checkAnswers() {
  const correctFound = userAntonyms.value.filter(a => 
    currentWord.value.antonyms.includes(a)
  ).length
  
  if (correctFound > 0) {
    score.value += correctFound
  }
  showAnswer.value = true
}

function nextWord() {
  if (currentIndex.value < words.length - 1) {
    currentIndex.value++
    userInput.value = ''
    userAntonyms.value = []
    showAnswer.value = false
  } else {
    currentIndex.value = words.length
  }
}

function reset() {
  currentIndex.value = 0
  userInput.value = ''
  userAntonyms.value = []
  showAnswer.value = false
  score.value = 0
}

const isFinished = computed(() => currentIndex.value >= words.length)
</script>

<template>
  <div class="practice-container animate-pop">
    <header class="practice-header">
      <div class="header-top">
        <h1 class="practice-title">Antónimos</h1>
        <button type="button" class="reset-btn" @click="reset">🔄 Reiniciar</button>
      </div>
      <p class="practice-subtitle">
        Escribe los antónimos (palabras con significado opuesto) que conozcas
      </p>
    </header>

    <div v-if="!isFinished" class="practice-content">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <div class="progress-text">
        Palabra {{ currentIndex + 1 }} de {{ words.length }}
      </div>

      <div class="word-card">
        <div class="word-label">Palabra en inglés</div>
        <div class="word-main">{{ currentWord.word }}</div>
        <div v-if="currentWord.hint" class="translation-box">
          <span class="translation-label">🇪🇸 Traducción:</span>
          <span class="translation-text">{{ currentWord.hint }}</span>
        </div>
      </div>

      <div class="input-section">
        <label class="input-label">Escribe un antónimo y presiona Enter</label>
        <div class="input-row">
          <input
            v-model="userInput"
            type="text"
            class="antonym-input"
            placeholder="ej. cold..."
            @keyup.enter="addAntonym"
            :disabled="showAnswer"
          />
          <button type="button" class="add-btn" @click="addAntonym" :disabled="showAnswer">Agregar</button>
        </div>
      </div>

      <div v-if="userAntonyms.length > 0" class="user-antonyms">
        <div class="section-label">Tus antónimos:</div>
        <div class="antonym-tags">
          <span v-for="(ant, idx) in userAntonyms" :key="idx" class="antonym-tag">
            {{ ant }}
          </span>
        </div>
      </div>

      <div class="actions">
        <button
          v-if="!showAnswer"
          type="button"
          class="check-btn"
          @click="checkAnswers"
          :disabled="userAntonyms.length === 0"
        >
          Comprobar
        </button>
        <button v-else type="button" class="next-btn" @click="nextWord">
          {{ currentIndex < words.length - 1 ? 'Siguiente palabra →' : 'Ver resultados' }}
        </button>
      </div>

      <div v-if="showAnswer" class="answer-section">
        <div class="answer-title">Antónimos correctos:</div>
        <div class="correct-antonyms">
          <span v-for="(ant, idx) in currentWord.antonyms" :key="idx" class="correct-tag">
            {{ ant }}
          </span>
        </div>
        <div class="feedback">
          Encontraste {{ userAntonyms.filter(a => currentWord.antonyms.includes(a)).length }} antónimo(s) correcto(s)
        </div>
      </div>
    </div>

    <div v-else class="finished-section">
      <div class="finished-icon">🎉</div>
      <h2 class="finished-title">¡Completado!</h2>
      <p class="finished-score">Puntos totales: {{ score }}</p>
      <button type="button" class="restart-btn" @click="reset">Practicar de nuevo</button>
    </div>
  </div>
</template>

<style scoped>
.practice-container {
  max-width: 700px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}

.practice-header {
  margin-bottom: 2rem;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.practice-title {
  font-size: 2rem;
  font-weight: 800;
  color: #fff;
}

.reset-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reset-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.practice-subtitle {
  color: var(--text-muted);
}

.progress-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #f59e0b, #ef4444);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 1.5rem;
}

.word-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 2rem;
  text-align: center;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-card);
}

.word-label {
  font-size: 0.8rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 0.75rem;
}

.word-main {
  font-size: 2.5rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 0.5rem;
  text-transform: capitalize;
}

.translation-box {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.translation-label {
  color: #fbbf24;
  font-weight: 700;
  font-size: 0.875rem;
}

.translation-text {
  color: #fcd34d;
  font-size: 1rem;
  font-weight: 600;
}

.input-section {
  margin-bottom: 1.25rem;
}

.input-label {
  display: block;
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.input-row {
  display: flex;
  gap: 0.5rem;
}

.antonym-input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: #fff;
  font-family: inherit;
  font-size: 0.9rem;
}

.antonym-input:focus {
  outline: none;
  border-color: #f59e0b;
  background: rgba(255, 255, 255, 0.08);
}

.antonym-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-btn {
  padding: 0.75rem 1.25rem;
  background: linear-gradient(90deg, #f59e0b, #ef4444);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-btn:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.user-antonyms {
  margin-bottom: 1.25rem;
}

.section-label {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.antonym-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.antonym-tag {
  padding: 0.4rem 0.75rem;
  background: rgba(245, 158, 11, 0.16);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: var(--radius-full);
  color: #fbbf24;
  font-size: 0.875rem;
}

.actions {
  margin-bottom: 1.5rem;
}

.check-btn, .next-btn {
  width: 100%;
  padding: 0.85rem;
  background: linear-gradient(90deg, #f59e0b, #ef4444);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.check-btn:hover:not(:disabled), .next-btn:hover {
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.check-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.answer-section {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
}

.answer-title {
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.75rem;
}

.correct-antonyms {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.correct-tag {
  padding: 0.4rem 0.75rem;
  background: rgba(34, 197, 94, 0.16);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: var(--radius-full);
  color: #86efac;
  font-size: 0.875rem;
}

.feedback {
  color: #fbbf24;
  font-size: 0.9rem;
}

.finished-section {
  text-align: center;
  padding: 3rem 2rem;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.finished-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.finished-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: #fff;
  margin-bottom: 0.5rem;
}

.finished-score {
  font-size: 1.25rem;
  color: #fbbf24;
  margin-bottom: 1.5rem;
}

.restart-btn {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(90deg, #f59e0b, #ef4444);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.restart-btn:hover {
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}
</style>
