<script setup lang="ts">
import { computed, ref } from 'vue'
import { verbs } from '~/data/verbs'
import { useStats } from '~/composables/useStats'
import type { Verb, VerbMasteryStatus, VerbProgress } from '~/types/verb'

const emit = defineEmits<{
  (e: 'practice', verbs: Verb[]): void
}>()

const { progress } = useStats()

type FilterId = 'all' | 'mastered' | 'learning' | 'unseen' | 'failed'

const filterOptions: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'mastered', label: 'Dominados' },
  { id: 'learning', label: 'Por dominar' },
  { id: 'unseen', label: 'Sin practicar' },
  { id: 'failed', label: 'Con fallos' },
]

const search = ref('')
const activeFilter = ref<FilterId>('all')

function matchesSearch(item: VerbProgress, term: string): boolean {
  if (!term) return true
  const haystack = [
    item.verb.spanish,
    item.verb.base,
    item.verb.past,
    item.verb.participle,
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(term)
}

function matchesFilter(item: VerbProgress, filter: FilterId): boolean {
  switch (filter) {
    case 'mastered':
      return item.status === 'mastered'
    case 'learning':
      return item.status === 'learning'
    case 'unseen':
      return item.status === 'unseen'
    case 'failed':
      // Mastered verbs keep their historical misses but no longer need review.
      return item.status !== 'mastered' && (item.stat?.incorrect ?? 0) > 0
    default:
      return true
  }
}

const filteredVerbs = computed<VerbProgress[]>(() => {
  const term = search.value.trim().toLowerCase()
  return progress.value.filter(
    (item) => matchesSearch(item, term) && matchesFilter(item, activeFilter.value)
  )
})

function statusLabel(status: VerbMasteryStatus): string {
  switch (status) {
    case 'mastered':
      return 'Dominado'
    case 'learning':
      return 'En práctica'
    default:
      return 'Sin practicar'
  }
}

function practice(verb: Verb) {
  emit('practice', [verb])
}
</script>

<template>
  <div class="library-container animate-pop">
    <!-- Header -->
    <header class="library-header">
      <h1 class="library-title">Biblioteca de verbos</h1>
      <p class="library-subtitle">
        {{ verbs.length }} verbos con su estado de dominio guardado en este dispositivo.
      </p>
    </header>

    <!-- Search + filters -->
    <div class="library-toolbar">
      <div class="search-row">
        <span class="search-icon">🔍</span>
        <input
          v-model="search"
          type="search"
          class="search-input"
          placeholder="Buscar por español, base, pasado o participio..."
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
        />
      </div>

      <div class="chip-group">
        <button
          v-for="opt in filterOptions"
          :key="opt.id"
          type="button"
          class="chip-btn"
          :class="{ active: activeFilter === opt.id }"
          @click="activeFilter = opt.id"
        >
          {{ opt.label }}
        </button>
      </div>

      <span class="result-counter">{{ filteredVerbs.length }} verbos</span>
    </div>

    <!-- List -->
    <div v-if="filteredVerbs.length > 0" class="verb-list">
      <div v-for="item in filteredVerbs" :key="item.verb.base" class="verb-row">
        <div class="row-main">
          <span class="status-dot" :class="`status-dot--${item.status}`" />
          <div class="row-text">
            <div class="row-title">
              <span class="verb-spanish">{{ item.verb.spanish }}</span>
              <span class="badge" :class="item.status === 'mastered'
                ? 'badge-mastered'
                : item.status === 'learning'
                  ? 'badge-learning'
                  : 'badge-unseen'">
                {{ statusLabel(item.status) }}
              </span>
            </div>
            <span class="verb-forms">
              {{ item.verb.base }} → {{ item.verb.past }} → {{ item.verb.participle }}
            </span>
            <div class="row-badges">
              <span class="badge" :class="item.verb.type === 'irregular' ? 'badge-irregular' : 'badge-regular'">
                {{ item.verb.type === 'irregular' ? 'Irregular' : 'Regular' }}
              </span>
              <span class="badge badge-level">{{ item.verb.level }}</span>
            </div>
          </div>
        </div>

        <div class="row-side">
          <div class="row-counters">
            <span class="counter counter--success">{{ item.stat?.correct ?? 0 }}</span>
            <span class="counter counter--error">{{ item.stat?.incorrect ?? 0 }}</span>
            <span v-if="(item.stat?.attempts ?? 0) > 0" class="metric-chip">{{ item.accuracy }}%</span>
          </div>
          <button
            type="button"
            class="practice-btn"
            :aria-label="`Practicar ${item.verb.spanish}`"
            :title="`Practicar ${item.verb.spanish}`"
            @click="practice(item.verb)"
          >
            ▶
          </button>
        </div>
      </div>
    </div>

    <p v-else class="empty-state">Ningún verbo coincide con tu búsqueda o filtro.</p>
  </div>
</template>

<style scoped>
.library-container {
  max-width: 820px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Header */
.library-header {
  text-align: center;
}

.library-title {
  font-size: clamp(1.6rem, 3vw, 2.1rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #fff;
}

.library-subtitle {
  margin-top: 0.4rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

/* Toolbar */
.library-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.1rem;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-card);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.9rem;
  background: var(--surface-inset);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
}

.search-row:focus-within {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
}

.search-icon {
  font-size: 0.9rem;
  opacity: 0.7;
}

.search-input {
  flex: 1;
  padding: 0.7rem 0;
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-size: 0.9rem;
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--text-dim);
}

.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chip-btn {
  padding: 0.45rem 0.8rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.chip-btn:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.15);
}

.chip-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
  box-shadow: 0 4px 12px var(--primary-glow);
}

.result-counter {
  align-self: flex-end;
  font-size: 0.775rem;
  font-weight: 700;
  color: var(--primary-light);
}

/* Rows */
.verb-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.verb-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.8rem;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
}

.verb-row:hover {
  background: var(--surface-card-hover);
  border-color: rgba(255, 255, 255, 0.15);
}

.row-main {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  min-width: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  margin-top: 0.4rem;
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

.row-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.verb-spanish {
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--text-main);
}

.verb-forms {
  font-size: 0.8rem;
  font-family: var(--font-mono);
  color: var(--primary-light);
}

.row-badges {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.1rem;
}

.badge-mastered {
  background: var(--success-bg);
  border: 1px solid var(--success-border);
  color: var(--success);
}

.badge-learning {
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: var(--streak);
}

.badge-unseen {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  color: var(--text-dim);
}

.row-side {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.row-counters {
  display: flex;
  align-items: center;
  gap: 0.35rem;
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

.practice-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.practice-btn:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: var(--primary);
  color: #fff;
  transform: scale(1.08);
}

@media (max-width: 560px) {
  .verb-row {
    flex-direction: column;
    align-items: flex-start;
  }
  .row-side {
    align-self: stretch;
    justify-content: space-between;
  }
}

.empty-state {
  padding: 1.25rem;
  background: var(--surface-inset);
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  color: var(--text-muted);
  text-align: center;
}
</style>
