<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStats } from '~/composables/useStats'
import type { Verb } from '~/types/verb'

const emit = defineEmits<{
  (e: 'practice', verbs: Verb[]): void
}>()

const { summary, masteredVerbs, unmasteredVerbs, problemVerbs, clearStats } = useStats()

/** Keep the rendered list light on large catalogs. */
const UNMASTERED_LIMIT = 60

const confirmReset = ref(false)

const masteredPercent = computed(() => {
  if (!summary.value.totalVerbs) return 0
  return Math.round((summary.value.masteredCount / summary.value.totalVerbs) * 100)
})

const visibleUnmastered = computed(() => unmasteredVerbs.value.slice(0, UNMASTERED_LIMIT))

const hiddenUnmasteredCount = computed(() =>
  Math.max(0, unmasteredVerbs.value.length - visibleUnmastered.value.length)
)

function startReview() {
  if (problemVerbs.value.length === 0) return
  emit('practice', problemVerbs.value)
}

function handleReset() {
  if (!confirmReset.value) {
    confirmReset.value = true
    return
  }
  clearStats()
  confirmReset.value = false
}
</script>

<template>
  <div class="stats-container animate-pop">
    <!-- Header -->
    <header class="stats-header">
      <h1 class="stats-title">Tus estadísticas</h1>
      <p class="stats-subtitle">
        Progreso de dominio guardado solo en este dispositivo.
      </p>
    </header>

    <!-- Summary grid -->
    <div class="summary-grid">
      <div class="summary-card">
        <span class="summary-value summary-value--success">{{ summary.totalCorrect }}</span>
        <span class="summary-label">Aciertos</span>
      </div>
      <div class="summary-card">
        <span class="summary-value summary-value--error">{{ summary.totalIncorrect }}</span>
        <span class="summary-label">Fallos</span>
      </div>
      <div class="summary-card">
        <span class="summary-value">{{ summary.accuracy }}%</span>
        <span class="summary-label">Precisión</span>
      </div>
      <div class="summary-card">
        <span class="summary-value">
          {{ summary.masteredCount }}<span class="summary-total">/{{ summary.totalVerbs }}</span>
        </span>
        <span class="summary-label">Verbos dominados</span>
      </div>
      <div class="summary-card">
        <span class="summary-value summary-value--streak">🔥 {{ summary.bestStreak }}</span>
        <span class="summary-label">Racha récord</span>
      </div>
    </div>

    <!-- Mastery progress -->
    <section class="panel-card">
      <div class="panel-header">
        <h2 class="panel-title">Progreso de dominio</h2>
        <span class="panel-metric">{{ masteredPercent }}%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${masteredPercent}%` }" />
      </div>
      <p class="panel-note">
        {{ summary.masteredCount }} de {{ summary.totalVerbs }} verbos dominados
      </p>
      <p class="rule-note">
        Un verbo cuenta como dominado tras 3 aciertos seguidos; un fallo reinicia la racha.
      </p>
    </section>

    <!-- Mastered verbs -->
    <section class="panel-card">
      <div class="panel-header">
        <h2 class="panel-title">Verbos que manejas</h2>
        <span class="panel-metric">{{ masteredVerbs.length }}</span>
      </div>

      <div v-if="masteredVerbs.length > 0" class="verb-list">
        <div v-for="item in masteredVerbs" :key="item.verb.base" class="verb-row">
          <div class="verb-main">
            <span class="status-dot status-dot--mastered" />
            <div class="verb-text">
              <span class="verb-spanish">{{ item.verb.spanish }}</span>
              <span class="verb-base">{{ item.verb.base }}</span>
            </div>
          </div>
          <div class="verb-metrics">
            <span class="counter counter--success">{{ item.stat?.correct ?? 0 }}</span>
            <span class="counter counter--error">{{ item.stat?.incorrect ?? 0 }}</span>
            <span class="metric-chip">{{ item.accuracy }}%</span>
            <span class="streak-chip">en racha {{ item.stat?.streak ?? 0 }}</span>
          </div>
        </div>
      </div>

      <p v-else class="empty-state">
        Todavía no dominas ningún verbo. Consigue 3 aciertos seguidos en un verbo.
      </p>
    </section>

    <!-- Unmastered verbs -->
    <section class="panel-card">
      <div class="panel-header">
        <h2 class="panel-title">Verbos que no manejas</h2>
        <span class="panel-metric">{{ unmasteredVerbs.length }}</span>
      </div>

      <div v-if="visibleUnmastered.length > 0" class="verb-list">
        <div v-for="item in visibleUnmastered" :key="item.verb.base" class="verb-row">
          <div class="verb-main">
            <span class="status-dot" :class="`status-dot--${item.status}`" />
            <div class="verb-text">
              <span class="verb-spanish">{{ item.verb.spanish }}</span>
              <span class="verb-base">{{ item.verb.base }}</span>
            </div>
          </div>
          <div class="verb-metrics">
            <span class="badge" :class="item.status === 'learning' ? 'badge-learning' : 'badge-unseen'">
              {{ item.status === 'learning' ? 'En práctica' : 'Sin practicar' }}
            </span>
            <span class="counter counter--success">{{ item.stat?.correct ?? 0 }}</span>
            <span class="counter counter--error">{{ item.stat?.incorrect ?? 0 }}</span>
            <span class="metric-chip">{{ item.accuracy }}%</span>
          </div>
        </div>
      </div>

      <p v-else class="empty-state">¡Dominas todos los verbos del catálogo!</p>

      <p v-if="hiddenUnmasteredCount > 0" class="more-note">
        +{{ hiddenUnmasteredCount }} más en la sección Verbos
      </p>
    </section>

    <!-- Actions -->
    <div class="actions">
      <button
        type="button"
        class="primary-btn"
        :disabled="problemVerbs.length === 0"
        @click="startReview"
      >
        Repasar mis fallos ({{ problemVerbs.length }})
      </button>
      <button
        type="button"
        class="danger-btn"
        :class="{ 'danger-btn--armed': confirmReset }"
        @click="handleReset"
      >
        {{ confirmReset ? '¿Confirmar borrado?' : 'Reiniciar estadísticas' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.stats-container {
  max-width: 820px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Header */
.stats-header {
  text-align: center;
  margin-bottom: 0.25rem;
}

.stats-title {
  font-size: clamp(1.6rem, 3vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #fff;
}

.stats-subtitle {
  margin-top: 0.4rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Summary */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.75rem;
}

@media (max-width: 700px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.summary-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 1rem 0.5rem;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  text-align: center;
}

.summary-value {
  font-size: 1.4rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}

.summary-value--success {
  color: var(--success);
}

.summary-value--error {
  color: var(--error);
}

.summary-value--streak {
  color: var(--streak);
}

.summary-total {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-dim);
}

.summary-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

/* Panels */
.panel-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.35rem;
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-card);
}

.panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.panel-title {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #fff;
}

.panel-metric {
  font-size: 0.825rem;
  font-weight: 700;
  color: var(--primary-light);
}

.progress-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary-gradient);
  border-radius: var(--radius-full);
  transition: width 0.3s ease;
}

.panel-note {
  margin-top: 0.55rem;
  font-size: 0.825rem;
  font-weight: 600;
  color: var(--text-muted);
}

.rule-note {
  margin-top: 0.35rem;
  font-size: 0.775rem;
  color: var(--text-dim);
}

/* Verb rows */
.verb-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.verb-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.7rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.verb-main {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text-dim);
}

.status-dot--mastered {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
}

.status-dot--learning {
  background: var(--streak);
  box-shadow: 0 0 8px var(--streak-glow);
}

.status-dot--unseen {
  background: var(--text-dim);
}

.verb-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.verb-spanish {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.verb-base {
  font-size: 0.775rem;
  font-family: var(--font-mono);
  color: var(--text-dim);
}

.verb-metrics {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.counter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  padding: 0.15rem 0.4rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 800;
}

.counter--success {
  background: var(--success-bg);
  border: 1px solid var(--success-border);
  color: var(--success);
}

.counter--error {
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  color: var(--error);
}

.metric-chip {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.streak-chip {
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.15rem 0.45rem;
  border-radius: var(--radius-full);
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: var(--streak);
  white-space: nowrap;
}

.badge-learning {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: var(--streak);
  white-space: nowrap;
}

.badge-unseen {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  color: var(--text-dim);
  white-space: nowrap;
}

@media (max-width: 560px) {
  .verb-row {
    flex-direction: column;
    align-items: flex-start;
  }
  .verb-metrics {
    flex-wrap: wrap;
  }
}

.empty-state {
  padding: 1rem;
  background: var(--surface-inset);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
}

.more-note {
  margin-top: 0.65rem;
  font-size: 0.775rem;
  color: var(--text-dim);
  text-align: center;
}

/* Actions */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.primary-btn {
  flex: 1;
  min-width: 220px;
  padding: 0.85rem 1.5rem;
  background: var(--primary-gradient);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  box-shadow: 0 6px 20px var(--primary-glow);
  transition: all 0.2s ease;
}

.primary-btn:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.primary-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.danger-btn {
  padding: 0.85rem 1.25rem;
  background: transparent;
  border: 1px solid var(--error-border);
  border-radius: var(--radius-md);
  color: var(--error);
  font-weight: 700;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.danger-btn:hover {
  background: var(--error-bg);
}

.danger-btn--armed {
  background: var(--error-bg);
  border-color: var(--error);
  color: #fecdd3;
}
</style>
