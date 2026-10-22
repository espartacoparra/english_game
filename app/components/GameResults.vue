<script setup lang="ts">
import { computed } from 'vue'
import { useVerbGame } from '~/composables/useVerbGame'
import type { TenseKey } from '~/types/verb'

const props = defineProps<{
  attempts?: number
}>()

const {
  results,
  score,
  selectedVerbs,
  maxStreak,
  sessionDuration,
  accuracy,
  resetGame,
  retryMistakes,
  mode,
  normalizedCompare,
} = useVerbGame()

const isCardMode = computed(() => mode.value === 'card-matching')
const totalVerbs = computed(() => selectedVerbs.value.length)
const failedVerbs = computed(() => results.value.filter((r) => !r.correct))

const tenseLabels: Record<TenseKey, string> = {
  base: 'Infinitivo',
  past: 'Pasado Simple',
  participle: 'Participio Pasado',
}

const tenseOrder: TenseKey[] = ['base', 'past', 'participle']

const feedbackTitle = computed(() => {
  if (isCardMode.value) return '¡Juego completado!'
  if (accuracy.value >= 90) return '¡Extraordinario! 🏆'
  if (accuracy.value >= 70) return '¡Muy bien hecho! 🌟'
  if (accuracy.value >= 50) return '¡Buen esfuerzo! 👍'
  return '¡Sigue practicando! 💪'
})

function formatDuration(sec: number): string {
  if (!sec || sec < 1) return 'Rápido'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}
</script>

<template>
  <div class="results-container animate-pop">
    <!-- Hero Banner -->
    <header class="results-hero">
      <div class="trophy-badge">
        {{ accuracy >= 80 || isCardMode ? '🎉' : '🎯' }}
      </div>
      <h1 class="hero-title">{{ feedbackTitle }}</h1>
      <p class="hero-subtitle">
        {{ isCardMode
          ? `Completaste todos los emparejamientos en ${attempts ?? 0} intentos.`
          : `Has completado tu sesión de práctica de verbos en inglés.`
        }}
      </p>
    </header>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div v-if="!isCardMode" class="stat-card">
        <span class="stat-number">{{ score }} / {{ totalVerbs }}</span>
        <span class="stat-label">Aciertos</span>
      </div>

      <div v-if="!isCardMode" class="stat-card">
        <span class="stat-number">{{ accuracy }}%</span>
        <span class="stat-label">Precisión</span>
      </div>

      <div v-if="!isCardMode && maxStreak > 0" class="stat-card">
        <span class="stat-number">🔥 {{ maxStreak }}</span>
        <span class="stat-label">Racha máxima</span>
      </div>

      <div v-if="isCardMode" class="stat-card">
        <span class="stat-number">{{ attempts ?? 0 }}</span>
        <span class="stat-label">Intentos totales</span>
      </div>

      <div v-if="isCardMode" class="stat-card">
        <span class="stat-number">{{ selectedVerbs.length }}</span>
        <span class="stat-label">Grupos resueltos</span>
      </div>

      <div class="stat-card">
        <span class="stat-number">{{ formatDuration(sessionDuration) }}</span>
        <span class="stat-label">Tiempo total</span>
      </div>
    </div>

    <!-- Review Section (For write-all & fill-missing) -->
    <section v-if="!isCardMode && results.length > 0" class="review-section">
      <div class="review-header">
        <h2 class="review-title">Revisión detallada de verbos</h2>
        <span class="review-count">{{ results.length }} verbos practicados</span>
      </div>

      <div class="review-list">
        <div
          v-for="res in results"
          :key="res.verb.base"
          class="review-item"
          :class="{ 'item--failed': !res.correct, 'item--success': res.correct }"
        >
          <div class="item-top">
            <div class="item-title-row">
              <span class="status-indicator">{{ res.correct ? '✓' : '✕' }}</span>
              <h3 class="verb-spanish">{{ res.verb.spanish }}</h3>
            </div>

            <div class="item-badges">
              <span class="badge" :class="res.verb.type === 'irregular' ? 'badge-irregular' : 'badge-regular'">
                {{ res.verb.type }}
              </span>
              <span class="badge badge-level">{{ res.verb.level }}</span>
            </div>
          </div>

          <!-- Tenses Table -->
          <div class="tenses-breakdown">
            <div v-for="tense in tenseOrder" :key="tense" class="tense-row">
              <div class="tense-name-col">
                <span class="tense-name">{{ tenseLabels[tense] }}</span>
              </div>

              <div class="tense-comparison">
                <span
                  class="user-val"
                  :class="{
                    correct: normalizedCompare(res.userAnswers[tense] || '', res.verb[tense]),
                    wrong: !normalizedCompare(res.userAnswers[tense] || '', res.verb[tense]),
                  }"
                >
                  {{ res.userAnswers[tense] || '(en blanco)' }}
                </span>

                <span
                  v-if="!normalizedCompare(res.userAnswers[tense] || '', res.verb[tense])"
                  class="correct-val"
                >
                  → {{ res.verb[tense] }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer Actions -->
    <footer class="results-actions">
      <button
        v-if="!isCardMode && failedVerbs.length > 0"
        type="button"
        class="retry-btn"
        @click="retryMistakes"
      >
        🔄 Repasar solo los errores ({{ failedVerbs.length }})
      </button>

      <button class="primary-btn" type="button" @click="resetGame">
        Nuevo juego / Menú principal →
      </button>
    </footer>
  </div>
</template>

<style scoped>
.results-container {
  max-width: 760px;
  margin: 0 auto;
  padding: 2.5rem 1rem 4rem;
}

.results-hero {
  text-align: center;
  margin-bottom: 2rem;
}

.trophy-badge {
  font-size: 3rem;
  line-height: 1;
  margin-bottom: 0.5rem;
}

.hero-title {
  font-size: clamp(2rem, 4vw, 2.5rem);
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
}

.hero-subtitle {
  font-size: 1rem;
  color: var(--text-muted);
  margin-top: 0.35rem;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 2.5rem;
}

.stat-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 1.25rem 1rem;
  text-align: center;
  backdrop-filter: blur(16px);
  box-shadow: var(--shadow-card);
}

.stat-number {
  display: block;
  font-size: 1.6rem;
  font-weight: 800;
  font-family: var(--font-mono);
  color: #fff;
}

.stat-label {
  display: block;
  font-size: 0.775rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
  margin-top: 0.35rem;
}

/* Review Section */
.review-section {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.75rem;
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-card);
  margin-bottom: 2rem;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.review-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #fff;
}

.review-count {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.review-item {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.25);
  padding: 1rem;
  transition: border-color 0.2s ease;
}

.review-item.item--success {
  border-left: 4px solid var(--success);
}

.review-item.item--failed {
  border-left: 4px solid var(--error);
}

.item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.item-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-indicator {
  font-weight: 900;
  font-size: 0.9rem;
}

.item--success .status-indicator {
  color: var(--success);
}

.item--failed .status-indicator {
  color: var(--error);
}

.verb-spanish {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}

.item-badges {
  display: flex;
  gap: 0.4rem;
}

.tenses-breakdown {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tense-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.02);
}

.tense-name-col {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 150px;
}

.tense-name {
  color: var(--text-dim);
  font-weight: 600;
}

.tense-comparison {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
}

.user-val.correct {
  color: #6ee7b7;
  font-weight: 600;
}

.user-val.wrong {
  color: #fda4af;
  text-decoration: line-through;
}

.correct-val {
  color: #6ee7b7;
  font-weight: 700;
}

.tts-button--micro {
  width: 1.5rem;
  height: 1.5rem;
  font-size: 0.75rem;
}

/* Actions */
.results-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.retry-btn {
  padding: 0.9rem 1.5rem;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: var(--radius-md);
  color: #fde68a;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: rgba(245, 158, 11, 0.25);
  transform: translateY(-1px);
}

.primary-btn {
  padding: 1rem 1.5rem;
  background: var(--primary-gradient);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 20px var(--primary-glow);
  transition: all 0.2s ease;
}

.primary-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
</style>
