<script setup lang="ts">
import { computed } from 'vue'
import { verbs } from '~/data/verbs'
import { useStats } from '~/composables/useStats'

type Section = 'practice' | 'stats' | 'verbs'

const emit = defineEmits<{
  (e: 'navigate', section: Section): void
}>()

const { summary, problemVerbs } = useStats()

interface SectionCard {
  id: Section
  icon: string
  title: string
  description: string
  metric: string
  action: string
}

const sectionCards = computed<SectionCard[]>(() => [
  {
    id: 'practice',
    icon: '✍️',
    title: 'Practicar',
    description: 'Elige modo, tipo y nivel, y empieza una sesión.',
    metric: `${verbs.length} verbos disponibles · ${problemVerbs.value.length} con fallos para repasar`,
    action: 'Comenzar',
  },
  {
    id: 'stats',
    icon: '📊',
    title: 'Estadísticas',
    description: 'Aciertos, precisión y tu progreso de dominio.',
    metric: `${summary.value.masteredCount} dominados · ${summary.value.accuracy}% precisión`,
    action: 'Ver progreso',
  },
  {
    id: 'verbs',
    icon: '📚',
    title: 'Verbos',
    description: 'Explora el listado completo con su estado de dominio.',
    metric: `${summary.value.unseenCount} sin practicar`,
    action: 'Explorar',
  },
])
</script>

<template>
  <div class="menu-container animate-pop">
    <!-- Hero Header -->
    <header class="hero">
      <div class="hero-badge">
        <span class="pulse-dot" />
        <span>{{ verbs.length }} Verbos disponibles (Regulares + Irregulares)</span>
      </div>
      <h1 class="hero-title">
        Tu <span class="gradient-text">Hub de Práctica</span>
      </h1>
      <p class="hero-subtitle">
        Practica conjugaciones, revisa tus aciertos y descubre qué verbos ya dominas.
      </p>
    </header>

    <!-- Mini summary strip -->
    <div class="mini-summary">
      <div class="mini-cell">
        <span class="mini-value">{{ summary.totalCorrect }}</span>
        <span class="mini-label">Aciertos</span>
      </div>
      <div class="mini-cell">
        <span class="mini-value">{{ summary.accuracy }}%</span>
        <span class="mini-label">Precisión</span>
      </div>
      <div class="mini-cell">
        <span class="mini-value">
          {{ summary.masteredCount }}<span class="mini-total">/{{ summary.totalVerbs }}</span>
        </span>
        <span class="mini-label">Verbos dominados</span>
      </div>
      <div class="mini-cell">
        <span class="mini-value mini-value--error">{{ summary.totalIncorrect }}</span>
        <span class="mini-label">Fallos</span>
      </div>
    </div>

    <!-- Section cards -->
    <div class="section-grid">
      <button
        v-for="card in sectionCards"
        :key="card.id"
        type="button"
        class="section-card"
        @click="emit('navigate', card.id)"
      >
        <div class="card-icon">{{ card.icon }}</div>
        <h2 class="card-title">{{ card.title }}</h2>
        <p class="card-desc">{{ card.description }}</p>
        <span class="card-metric">{{ card.metric }}</span>
        <span class="card-action">{{ card.action }} →</span>
      </button>
    </div>

    <p class="storage-hint">
      🔒 Tus estadísticas se guardan solo en este dispositivo.
    </p>
  </div>
</template>

<style scoped>
.menu-container {
  max-width: 1040px;
  margin: 0 auto;
  padding: 2.5rem 1.25rem 4rem;
}

/* Hero */
.hero {
  text-align: center;
  margin-bottom: 2rem;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.28);
  color: #c7d2fe;
  padding: 0.35rem 0.9rem;
  border-radius: var(--radius-full);
  font-size: 0.825rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.hero-title {
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin-bottom: 0.75rem;
  color: #fff;
}

.gradient-text {
  background: var(--primary-gradient);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 1.05rem;
  color: var(--text-muted);
  max-width: 620px;
  margin: 0 auto;
}

/* Mini summary strip */
.mini-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--border-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 1.75rem;
}

@media (max-width: 560px) {
  .mini-summary {
    grid-template-columns: repeat(2, 1fr);
  }
}

.mini-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 1rem 0.5rem;
  background: var(--surface-card);
  text-align: center;
}

.mini-value {
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}

.mini-value--error {
  color: var(--error);
}

.mini-total {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-dim);
}

.mini-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

/* Section cards */
.section-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
}

@media (max-width: 860px) {
  .section-grid {
    grid-template-columns: 1fr;
  }
}

.section-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 1.5rem;
  text-align: left;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  color: inherit;
  font: inherit;
  backdrop-filter: blur(20px);
  cursor: pointer;
  transition: all 0.2s ease;
}

.section-card:hover,
.section-card:focus-visible {
  background: var(--surface-card-hover);
  border-color: var(--primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-card), var(--shadow-glow);
  outline: none;
}

.card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-sm);
  background: rgba(99, 102, 241, 0.16);
  border: 1px solid rgba(99, 102, 241, 0.3);
  font-size: 1.25rem;
  margin-bottom: 0.25rem;
}

.card-title {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}

.card-desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.card-metric {
  margin-top: 0.35rem;
  font-size: 0.775rem;
  font-weight: 700;
  color: var(--primary-light);
}

.card-action {
  margin-top: auto;
  padding-top: 0.75rem;
  font-size: 0.825rem;
  font-weight: 700;
  color: #fff;
}

.storage-hint {
  margin-top: 1.75rem;
  text-align: center;
  font-size: 0.775rem;
  color: var(--text-dim);
}
</style>
