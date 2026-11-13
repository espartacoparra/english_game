<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  answerFor,
  buildCognateQuizDeck,
  type CognateAnswer,
  type CognateQuizItem,
} from '~/data/cognateQuiz'
import RoomModeBanner from '~/components/room/RoomModeBanner.vue'

/**
 * One classifying game for both menu entries. The deck mixes true cognates and
 * false ones, so the two buttons below the word are real choices instead of a
 * self-report after the answer was already on screen.
 */
const props = defineProps<{ mode: 'cognates' | 'false-cognates' }>()

const POINTS_PER_HIT = 10

const deck = ref<CognateQuizItem[]>(buildCognateQuizDeck())
const currentIndex = ref(0)
const guess = ref<CognateAnswer | null>(null)
const score = ref(0)
const hits = ref(0)
const misses = ref(0)
const perKind = ref({
  cognate: { hits: 0, total: 0 },
  'false-cognate': { hits: 0, total: 0 },
})

const current = computed<CognateQuizItem | undefined>(() => deck.value[currentIndex.value])
const total = computed(() => deck.value.length)
const isFinished = computed(() => currentIndex.value >= deck.value.length)
const isAnswered = computed(() => guess.value !== null)
const isCorrect = computed(() => {
  const item = current.value
  return item !== undefined && guess.value !== null && guess.value === answerFor(item)
})
const isLastItem = computed(() => currentIndex.value === deck.value.length - 1)
const progressPercent = computed(() =>
  total.value === 0 ? 0 : Math.round(((currentIndex.value + 1) / total.value) * 100),
)
const accuracy = computed(() => {
  const answered = hits.value + misses.value
  return answered === 0 ? 0 : Math.round((hits.value / answered) * 100)
})

const bannerLabel = computed(() =>
  props.mode === 'cognates' ? 'Cognados' : 'Falsos Cognados',
)
const pageTitle = computed(() =>
  props.mode === 'cognates' ? 'Cognados' : 'Falsos Cognados',
)

function classify(choice: CognateAnswer) {
  const item = current.value
  if (!item || guess.value !== null) return

  guess.value = choice
  const right = choice === answerFor(item)
  perKind.value[item.kind].total++
  if (right) {
    hits.value++
    score.value += POINTS_PER_HIT
    perKind.value[item.kind].hits++
  } else {
    misses.value++
  }
}

function next() {
  if (guess.value === null) return
  guess.value = null
  currentIndex.value++
}

function reset() {
  deck.value = buildCognateQuizDeck()
  currentIndex.value = 0
  guess.value = null
  score.value = 0
  hits.value = 0
  misses.value = 0
  perKind.value = {
    cognate: { hits: 0, total: 0 },
    'false-cognate': { hits: 0, total: 0 },
  }
}
</script>

<template>
  <div class="practice-container animate-pop">
    <RoomModeBanner
      :mode="props.mode"
      :label="bannerLabel"
      description="Partida de clasificación: ¿la palabra es un cognado o una trampa?"
    />

    <header class="practice-header">
      <div class="header-top">
        <h1 class="practice-title">{{ pageTitle }}</h1>
        <button type="button" class="reset-btn" @click="reset">🔄 Reiniciar</button>
      </div>
      <p class="practice-subtitle">
        La partida mezcla cognados verdaderos y falsos. Decide qué es cada palabra antes de ver la respuesta.
      </p>
    </header>

    <div v-if="!isFinished && current" class="practice-content">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <div class="progress-text">
        Palabra {{ currentIndex + 1 }} de {{ total }} | Aciertos: {{ hits }} · Fallos: {{ misses }}
      </div>

      <div class="quiz-card" :class="{ 'quiz-card--answered': isAnswered }">
        <div class="card-header">
          <span class="word-hint">¿Qué tipo de palabra es?</span>
        </div>

        <div class="english-word">{{ current.english }}</div>

        <div v-if="!isAnswered" class="guess-section">
          <div class="actions">
            <button type="button" class="guess-btn guess-btn--cognate" @click="classify('cognate')">
              Es un cognado
            </button>
            <button type="button" class="guess-btn guess-btn--false" @click="classify('false-cognate')">
              Es un falso cognado
            </button>
          </div>
          <p class="guess-note">La respuesta correcta se revela al pulsar un botón.</p>
        </div>

        <div v-else class="feedback-section" aria-live="polite">
          <div class="verdict" :class="isCorrect ? 'verdict--right' : 'verdict--wrong'">
            {{ isCorrect ? '✓ ¡Correcto!' : '✗ No era esa' }}
          </div>

          <div v-if="current.kind === 'cognate'" class="truth-section">
            <div class="truth-row">
              <span class="truth-label">Es un cognado verdadero</span>
              <span class="truth-value real">{{ current.english }} = {{ current.spanish }}</span>
            </div>
            <div class="truth-row">
              <span class="truth-label">Categoría</span>
              <span class="truth-value neutral">{{ current.category }}</span>
            </div>
          </div>

          <div v-else class="truth-section">
            <div class="truth-row">
              <span class="truth-label">Es un falso cognado</span>
              <span class="truth-value real">{{ current.realMeaning }}</span>
            </div>
            <div class="truth-row">
              <span class="truth-label">NO significa</span>
              <span class="truth-value false">{{ current.falseMeaning }}</span>
            </div>
            <div class="truth-row">
              <span class="truth-label">Parece</span>
              <span class="truth-value neutral">{{ current.looksLike }}</span>
            </div>
            <div v-if="current.example" class="example-box">
              <div class="example-label">Ejemplo</div>
              <div class="example-text">{{ current.example }}</div>
            </div>
          </div>

          <button type="button" class="next-btn" @click="next">
            {{ isLastItem ? 'Ver resultado →' : 'Siguiente palabra →' }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="finished-section">
      <div class="finished-icon">🎉</div>
      <h2 class="finished-title">¡Completado!</h2>
      <p class="finished-stats">
        Acertaste <strong>{{ hits }}</strong> de <strong>{{ total }}</strong> palabras ({{ accuracy }}% de precisión)
      </p>
      <div class="finished-breakdown">
        <div class="breakdown-item">
          <span class="breakdown-label">Cognados verdaderos</span>
          <span class="breakdown-value">{{ perKind.cognate.hits }} / {{ perKind.cognate.total }}</span>
        </div>
        <div class="breakdown-item">
          <span class="breakdown-label">Falsos cognados</span>
          <span class="breakdown-value">{{ perKind['false-cognate'].hits }} / {{ perKind['false-cognate'].total }}</span>
        </div>
      </div>
      <p class="finished-score">Puntos: {{ score }}</p>
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
  background: linear-gradient(90deg, #22c55e, #f59e0b);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 1.5rem;
}

.quiz-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 2rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-card);
  transition: border-color 0.2s ease;
}

.quiz-card--answered {
  border-color: rgba(99, 102, 241, 0.4);
}

.card-header {
  text-align: center;
  margin-bottom: 1.25rem;
}

.word-hint {
  color: var(--text-dim);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}

.english-word {
  font-size: 2.75rem;
  font-weight: 800;
  color: #fff;
  text-align: center;
  margin-bottom: 1.75rem;
  overflow-wrap: anywhere;
}

.guess-section {
  text-align: center;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.guess-btn {
  padding: 0.95rem 0.75rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.25;
  cursor: pointer;
  transition: all 0.2s ease;
}

.guess-btn--cognate {
  background: linear-gradient(90deg, #22c55e, #10b981);
}

.guess-btn--cognate:hover {
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
}

.guess-btn--false {
  background: linear-gradient(90deg, #f59e0b, #dc2626);
}

.guess-btn--false:hover {
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
}

.guess-note {
  margin-top: 0.85rem;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.feedback-section {
  margin-top: 0.5rem;
}

.verdict {
  text-align: center;
  font-size: 1.15rem;
  font-weight: 800;
  margin-bottom: 1.25rem;
}

.verdict--right {
  color: #86efac;
}

.verdict--wrong {
  color: #fca5a5;
}

.truth-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 1.25rem;
}

.truth-row {
  margin-bottom: 0.9rem;
}

.truth-row:last-of-type {
  margin-bottom: 1rem;
}

.truth-label {
  display: block;
  color: var(--text-dim);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.4rem;
  font-weight: 600;
}

.truth-value {
  display: block;
  font-size: 1.1rem;
  font-weight: 600;
}

.truth-value.real {
  color: #86efac;
}

.truth-value.false {
  color: #fca5a5;
  text-decoration: line-through;
}

.truth-value.neutral {
  color: var(--text-muted);
  font-weight: 500;
}

.example-box {
  background: rgba(99, 102, 241, 0.1);
  border-left: 3px solid var(--primary);
  padding: 0.9rem 1rem;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  margin-top: 1rem;
}

.example-label {
  color: var(--primary-light);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.4rem;
}

.example-text {
  color: #c7d2fe;
  font-size: 0.9rem;
  line-height: 1.5;
}

.next-btn {
  width: 100%;
  margin-top: 1.25rem;
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

.next-btn:hover {
  box-shadow: 0 4px 12px var(--primary-glow);
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
  margin-bottom: 0.75rem;
}

.finished-stats {
  color: var(--text-muted);
  font-size: 1.05rem;
  margin-bottom: 1rem;
}

.finished-breakdown {
  display: grid;
  gap: 0.5rem;
  max-width: 360px;
  margin: 0 auto 1rem;
}

.breakdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0.9rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
}

.breakdown-label {
  color: var(--text-muted);
}

.breakdown-value {
  color: #fff;
  font-weight: 700;
}

.finished-score {
  font-size: 1.25rem;
  color: #86efac;
  margin-bottom: 1.5rem;
  font-weight: 700;
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

/* Phone layout: the answer row is two-column, so it needs the taller buttons. */
@media (max-width: 560px) {
  .practice-container {
    padding: 1.25rem 0.85rem 3rem;
  }

  .practice-title {
    font-size: 1.6rem;
  }

  .header-top {
    align-items: flex-start;
    gap: 0.75rem;
  }

  .reset-btn {
    flex: 0 0 auto;
    min-height: 2.5rem;
    white-space: nowrap;
  }

  .quiz-card {
    padding: 1.25rem 1rem;
  }

  .english-word {
    font-size: 2.1rem;
    margin-bottom: 1.25rem;
  }

  .actions {
    gap: 0.6rem;
  }

  .guess-btn {
    min-height: 3rem;
    font-size: 0.875rem;
  }
}
</style>
