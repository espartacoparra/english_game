<script setup lang="ts">
import { computed, ref } from 'vue'
import { COGNATE_ITEMS } from '~/data/practice'

const cognates = COGNATE_ITEMS

const currentIndex = ref(0)
const revealed = ref(false)
const score = ref(0)
const correct = ref(0)

const currentCognate = computed(() => cognates[currentIndex.value])
const progressPercent = computed(() => Math.round(((currentIndex.value + 1) / cognates.length) * 100))

function reveal() {
  revealed.value = true
}

function markKnown() {
  correct.value++
  score.value += 10
  next()
}

function markUnknown() {
  next()
}

function next() {
  if (currentIndex.value < cognates.length - 1) {
    currentIndex.value++
    revealed.value = false
  } else {
    currentIndex.value = cognates.length
  }
}

function reset() {
  currentIndex.value = 0
  revealed.value = false
  score.value = 0
  correct.value = 0
}

const isFinished = computed(() => currentIndex.value >= cognates.length)
</script>

<template>
  <div class="practice-container animate-pop">
    <header class="practice-header">
      <div class="header-top">
        <h1 class="practice-title">Cognados Verdaderos</h1>
        <button type="button" class="reset-btn" @click="reset">🔄 Reiniciar</button>
      </div>
      <p class="practice-subtitle">
        Palabras que se escriben igual o muy similar y tienen el mismo significado en español e inglés
      </p>
    </header>

    <div v-if="!isFinished" class="practice-content">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <div class="progress-text">
        Palabra {{ currentIndex + 1 }} de {{ cognates.length }} | Conocidas: {{ correct }}
      </div>

      <div class="cognate-card">
        <div class="card-header">
          <span class="category-badge">{{ currentCognate.category }}</span>
        </div>
        <div class="english-word">{{ currentCognate.english }}</div>
        <div v-if="revealed" class="spanish-section">
          <div class="equals">=</div>
          <div class="spanish-word">{{ currentCognate.spanish }}</div>
          <div class="match-badge">✓ Mismo significado</div>
        </div>
        <div v-else class="reveal-section">
          <button type="button" class="reveal-btn" @click="reveal">
            👀 Mostrar traducción
          </button>
        </div>
      </div>

      <div v-if="revealed" class="actions">
        <button type="button" class="known-btn" @click="markKnown">
          ✓ Ya lo conocía
        </button>
        <button type="button" class="unknown-btn" @click="markUnknown">
          → No lo conocía
        </button>
      </div>
    </div>

    <div v-else class="finished-section">
      <div class="finished-icon">🎉</div>
      <h2 class="finished-title">¡Completado!</h2>
      <p class="finished-stats">
        Conocías <strong>{{ correct }}</strong> de <strong>{{ cognates.length }}</strong> cognados
      </p>
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
  background: linear-gradient(90deg, #22c55e, #10b981);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 1.5rem;
}

.cognate-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 2rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-card);
}

.card-header {
  margin-bottom: 1.5rem;
}

.category-badge {
  display: inline-block;
  padding: 0.35rem 0.75rem;
  background: rgba(34, 197, 94, 0.16);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: var(--radius-full);
  color: #86efac;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.english-word {
  font-size: 2.75rem;
  font-weight: 800;
  color: #fff;
  text-align: center;
  margin-bottom: 1rem;
}

.spanish-section {
  text-align: center;
}

.equals {
  font-size: 1.75rem;
  color: var(--primary-light);
  margin-bottom: 0.75rem;
}

.spanish-word {
  font-size: 2.25rem;
  font-weight: 700;
  color: #86efac;
  margin-bottom: 0.75rem;
}

.match-badge {
  display: inline-block;
  padding: 0.4rem 0.9rem;
  background: rgba(34, 197, 94, 0.16);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: var(--radius-full);
  color: #86efac;
  font-size: 0.875rem;
  font-weight: 600;
}

.reveal-section {
  text-align: center;
  padding: 1rem 0;
}

.reveal-btn {
  padding: 0.75rem 1.75rem;
  background: var(--primary-gradient);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reveal-btn:hover {
  box-shadow: 0 4px 12px var(--primary-glow);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.known-btn, .unknown-btn {
  padding: 0.85rem;
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.known-btn {
  background: linear-gradient(90deg, #22c55e, #10b981);
}

.known-btn:hover {
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
}

.unknown-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-subtle);
}

.unknown-btn:hover {
  background: rgba(255, 255, 255, 0.12);
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
  margin-bottom: 0.5rem;
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
</style>
