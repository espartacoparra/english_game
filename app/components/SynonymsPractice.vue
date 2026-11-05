<script setup lang="ts">
import { computed, ref } from 'vue'

interface SynonymWord {
  word: string
  synonyms: string[]
  hint?: string
}

const words: SynonymWord[] = [
  { word: 'big', synonyms: ['large', 'huge', 'enormous', 'giant', 'massive'], hint: 'grande' },
  { word: 'small', synonyms: ['little', 'tiny', 'mini', 'petite', 'compact'], hint: 'pequeño' },
  { word: 'happy', synonyms: ['glad', 'joyful', 'cheerful', 'delighted', 'pleased'], hint: 'feliz' },
  { word: 'sad', synonyms: ['unhappy', 'sorrowful', 'depressed', 'gloomy', 'melancholy'], hint: 'triste' },
  { word: 'fast', synonyms: ['quick', 'rapid', 'swift', 'speedy', 'hasty'], hint: 'rápido' },
  { word: 'slow', synonyms: ['sluggish', 'gradual', 'leisurely', 'unhurried'], hint: 'lento' },
  { word: 'good', synonyms: ['great', 'fine', 'excellent', 'wonderful', 'superb'], hint: 'bueno' },
  { word: 'bad', synonyms: ['evil', 'awful', 'terrible', 'horrible', 'poor'], hint: 'malo' },
  { word: 'smart', synonyms: ['intelligent', 'clever', 'bright', 'wise', 'brilliant'], hint: 'inteligente' },
  { word: 'old', synonyms: ['ancient', 'aged', 'elderly', 'vintage', 'antique'], hint: 'viejo' },
]

const currentIndex = ref(0)
const userInput = ref('')
const userSynonyms = ref<string[]>([])
const showAnswer = ref(false)
const score = ref(0)
const attempts = ref(0)

const currentWord = computed(() => words[currentIndex.value])
const progressPercent = computed(() => Math.round(((currentIndex.value + 1) / words.length) * 100))

function addSynonym() {
  const synonym = userInput.value.trim().toLowerCase()
  if (!synonym) return
  if (!userSynonyms.value.includes(synonym)) {
    userSynonyms.value.push(synonym)
  }
  userInput.value = ''
}

function checkAnswers() {
  attempts.value++
  const correctFound = userSynonyms.value.filter(s => 
    currentWord.value.synonyms.includes(s)
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
    userSynonyms.value = []
    showAnswer.value = false
  } else {
    // Finished all words
    currentIndex.value = words.length // mark as finished
  }
}

function reset() {
  currentIndex.value = 0
  userInput.value = ''
  userSynonyms.value = []
  showAnswer.value = false
  score.value = 0
  attempts.value = 0
}

const isFinished = computed(() => currentIndex.value >= words.length)
</script>

<template>
  <div class="practice-container animate-pop">
    <header class="practice-header">
      <div class="header-top">
        <h1 class="practice-title">Sinónimos</h1>
        <button type="button" class="reset-btn" @click="reset">🔄 Reiniciar</button>
      </div>
      <p class="practice-subtitle">
        Escribe los sinónimos que conozcas para cada palabra en inglés
      </p>
    </header>

    <div v-if="!isFinished" class="practice-content">
      <!-- Progress -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <div class="progress-text">
        Palabra {{ currentIndex + 1 }} de {{ words.length }}
      </div>

      <!-- Current Word -->
      <div class="word-card">
        <div class="word-label">Palabra en inglés</div>
        <div class="word-main">{{ currentWord.word }}</div>
        <div v-if="currentWord.hint" class="translation-box">
          <span class="translation-label">🇪🇸 Traducción:</span>
          <span class="translation-text">{{ currentWord.hint }}</span>
        </div>
      </div>

      <!-- Input -->
      <div class="input-section">
        <label class="input-label">Escribe un sinónimo y presiona Enter</label>
        <div class="input-row">
          <input
            v-model="userInput"
            type="text"
            class="synonym-input"
            placeholder="ej. large, big..."
            @keyup.enter="addSynonym"
            :disabled="showAnswer"
          />
          <button type="button" class="add-btn" @click="addSynonym" :disabled="showAnswer">Agregar</button>
        </div>
      </div>

      <!-- User's synonyms -->
      <div v-if="userSynonyms.length > 0" class="user-synonyms">
        <div class="section-label">Tus sinónimos:</div>
        <div class="synonym-tags">
          <span v-for="(syn, idx) in userSynonyms" :key="idx" class="synonym-tag">
            {{ syn }}
          </span>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions">
        <button
          v-if="!showAnswer"
          type="button"
          class="check-btn"
          @click="checkAnswers"
          :disabled="userSynonyms.length === 0"
        >
          Comprobar
        </button>
        <button v-else type="button" class="next-btn" @click="nextWord">
          {{ currentIndex < words.length - 1 ? 'Siguiente palabra →' : 'Ver resultados' }}
        </button>
      </div>

      <!-- Answer -->
      <div v-if="showAnswer" class="answer-section">
        <div class="answer-title">Sinónimos correctos:</div>
        <div class="correct-synonyms">
          <span v-for="(syn, idx) in currentWord.synonyms" :key="idx" class="correct-tag">
            {{ syn }}
          </span>
        </div>
        <div class="feedback">
          Encontraste {{ userSynonyms.filter(s => currentWord.synonyms.includes(s)).length }} sinónimo(s) correcto(s)
        </div>
      </div>
    </div>

    <!-- Finished -->
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
  background: var(--primary-gradient);
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
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.translation-label {
  color: var(--primary-light);
  font-weight: 700;
  font-size: 0.875rem;
}

.translation-text {
  color: #c7d2fe;
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

.synonym-input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: #fff;
  font-family: inherit;
  font-size: 0.9rem;
}

.synonym-input:focus {
  outline: none;
  border-color: var(--primary);
  background: rgba(255, 255, 255, 0.08);
}

.synonym-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-btn {
  padding: 0.75rem 1.25rem;
  background: var(--primary-gradient);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-btn:hover:not(:disabled) {
  box-shadow: 0 4px 12px var(--primary-glow);
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.user-synonyms {
  margin-bottom: 1.25rem;
}

.section-label {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.synonym-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.synonym-tag {
  padding: 0.4rem 0.75rem;
  background: rgba(99, 102, 241, 0.16);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: var(--radius-full);
  color: #c7d2fe;
  font-size: 0.875rem;
}

.actions {
  margin-bottom: 1.5rem;
}

.check-btn, .next-btn {
  width: 100%;
  padding: 0.85rem;
  background: var(--primary-gradient);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.check-btn:hover:not(:disabled), .next-btn:hover {
  box-shadow: 0 4px 12px var(--primary-glow);
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

.correct-synonyms {
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
  color: var(--primary-light);
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
  color: var(--primary-light);
  margin-bottom: 1.5rem;
}

.restart-btn {
  padding: 0.75rem 1.5rem;
  background: var(--primary-gradient);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.restart-btn:hover {
  box-shadow: 0 4px 12px var(--primary-glow);
}
</style>
