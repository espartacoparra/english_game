<script setup lang="ts">
import { computed, ref } from 'vue'

interface FalseCognate {
  english: string
  looksLike: string
  realMeaning: string
  falseMeaning: string
  example?: string
}

const falseCognates: FalseCognate[] = [
  { 
    english: 'actually', 
    looksLike: 'actualmente', 
    realMeaning: 'en realidad / de hecho',
    falseMeaning: 'actualmente (que significa "currently")',
    example: '"Actually, I don\'t agree" = "En realidad, no estoy de acuerdo"'
  },
  { 
    english: 'currently', 
    looksLike: 'corriente', 
    realMeaning: 'actualmente / en este momento',
    falseMeaning: 'corriente (electric current) o corriente (trendy)',
    example: '"I\'m currently working" = "Actualmente estoy trabajando"'
  },
  { 
    english: 'embarrassed', 
    looksLike: 'embarazada', 
    realMeaning: 'avergonzado/a',
    falseMeaning: 'embarazada (pregnant)',
    example: '"I was embarrassed" = "Me sentí avergonzado"'
  },
  { 
    english: 'pregnant', 
    looksLike: 'preguntado', 
    realMeaning: 'embarazada',
    falseMeaning: 'preguntado (asked)',
    example: '"She\'s pregnant" = "Ella está embarazada"'
  },
  { 
    english: 'fabric', 
    looksLike: 'fábrica', 
    realMeaning: 'tela / tejido',
    falseMeaning: 'fábrica (factory)',
    example: '"This fabric is soft" = "Esta tela es suave"'
  },
  { 
    english: 'factory', 
    looksLike: 'factoría', 
    realMeaning: 'fábrica',
    falseMeaning: 'factoría vs fábrica - "factory" = fábrica',
    example: '"They work in a factory" = "Trabajan en una fábrica"'
  },
  { 
    english: 'sensible', 
    looksLike: 'sensible', 
    realMeaning: 'sensato / razonable',
    falseMeaning: 'sensible (sensitive)',
    example: '"That\'s a sensible decision" = "Esa es una decisión sensata"'
  },
  { 
    english: 'sensitive', 
    looksLike: 'sensible', 
    realMeaning: 'sensible / susceptible',
    falseMeaning: 'sensato (sensible)',
    example: '"She\'s very sensitive" = "Ella es muy sensible"'
  },
  { 
    english: 'realize', 
    looksLike: 'realizar', 
    realMeaning: 'darse cuenta / caer en cuenta',
    falseMeaning: 'realizar (to carry out/make)',
    example: '"I just realized the time!" = "¡Acabo de darme cuenta de la hora!"'
  },
  { 
    english: 'realize / accomplish', 
    looksLike: 'realizar', 
    realMeaning: 'realizar/efectuar (accomplish/carry out)',
    falseMeaning: 'darse cuenta (realize)',
    example: '"She realized her dream" = "Ella realizó su sueño"'
  },
  { 
    english: 'sympathetic', 
    looksLike: 'simpático', 
    realMeaning: 'comprensivo / compasivo',
    falseMeaning: 'simpático/agradable (nice/friendly)',
    example: '"He was very sympathetic" = "Fue muy comprensivo"'
  },
  { 
    english: 'nice / friendly', 
    looksLike: 'simpático', 
    realMeaning: 'simpático / agradable',
    falseMeaning: 'comprensivo (sympathetic)',
    example: '"He\'s a nice person" = "Es una persona simpática"'
  },
  { 
    english: 'exit', 
    looksLike: 'éxito', 
    realMeaning: 'salida',
    falseMeaning: 'éxito (success)',
    example: '"Take the exit on the right" = "Toma la salida a la derecha"'
  },
  { 
    english: 'success', 
    looksLike: 'suceso', 
    realMeaning: 'éxito',
    falseMeaning: 'suceso/evento (event/incident)',
    example: '"The project was a success" = "El proyecto fue un éxito"'
  },
  { 
    english: 'event / incident', 
    looksLike: 'evento', 
    realMeaning: 'suceso / acontecimiento',
    falseMeaning: 'evento (event)',
    example: '"There was a strange event" = "Hubo un suceso extraño"'
  },
  { 
    english: 'library', 
    looksLike: 'librería', 
    realMeaning: 'biblioteca',
    falseMeaning: 'librería (bookstore)',
    example: '"I go to the library to study" = "Voy a la biblioteca a estudiar"'
  },
  { 
    english: 'bookstore', 
    looksLike: 'librería', 
    realMeaning: 'librería',
    falseMeaning: 'biblioteca (library)',
    example: '"I bought this at the bookstore" = "Lo compré en la librería"'
  },
  { 
    english: 'parents', 
    looksLike: 'parientes', 
    realMeaning: 'padres',
    falseMeaning: 'parientes/relativos (relatives)',
    example: '"My parents are here" = "Mis padres están aquí"'
  },
  { 
    english: 'relatives', 
    looksLike: 'relativos', 
    realMeaning: 'parientes / familiares',
    falseMeaning: 'relativos (relatives in grammar)',
    example: '"All my relatives came" = "Vinieron todos mis parientes"'
  },
]

const currentIndex = ref(0)
const revealed = ref(false)
const score = ref(0)
const learned = ref(0)

const current = computed(() => falseCognates[currentIndex.value])
const progressPercent = computed(() => Math.round(((currentIndex.value + 1) / falseCognates.length) * 100))

function reveal() {
  revealed.value = true
}

function markLearned() {
  learned.value++
  score.value += 15
  next()
}

function markNoted() {
  next()
}

function next() {
  if (currentIndex.value < falseCognates.length - 1) {
    currentIndex.value++
    revealed.value = false
  } else {
    currentIndex.value = falseCognates.length
  }
}

function reset() {
  currentIndex.value = 0
  revealed.value = false
  score.value = 0
  learned.value = 0
}

const isFinished = computed(() => currentIndex.value >= falseCognates.length)
</script>

<template>
  <div class="practice-container animate-pop">
    <header class="practice-header">
      <div class="header-top">
        <h1 class="practice-title">Falsos Cognados</h1>
        <button type="button" class="reset-btn" @click="reset">🔄 Reiniciar</button>
      </div>
      <p class="practice-subtitle">
        Palabras que parecen tener un significado en español pero lo tienen diferente
      </p>
    </header>

    <div v-if="!isFinished" class="practice-content">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <div class="progress-text">
        Trampa {{ currentIndex + 1 }} de {{ falseCognates.length }} | Aprendidas: {{ learned }}
      </div>

      <div class="false-cognate-card">
        <div class="warning-header">
          <span class="warning-badge">⚠️ CUIDADO CON LA TRAMPA</span>
        </div>
        <div class="english-word">{{ current.english }}</div>
        <div class="looks-like">
          <span class="label">Parece...</span>
          <span class="looks-like-word">{{ current.looksLike }}</span>
        </div>
        
        <div v-if="revealed">
          <div class="truth-section">
            <div class="truth-row">
              <span class="truth-label">Significado REAL:</span>
              <span class="truth-value real">{{ current.realMeaning }}</span>
            </div>
            <div class="truth-row">
              <span class="truth-label">NO significa:</span>
              <span class="truth-value false">{{ current.falseMeaning }}</span>
            </div>
            <div v-if="current.example" class="example-box">
              <div class="example-label">Ejemplo:</div>
              <div class="example-text">{{ current.example }}</div>
            </div>
          </div>
        </div>
        <div v-else class="reveal-section">
          <button type="button" class="reveal-btn" @click="reveal">
            🔍 Revelar el significado correcto
          </button>
        </div>
      </div>

      <div v-if="revealed" class="actions">
        <button type="button" class="learned-btn" @click="markLearned">
          ✓ Lo he aprendido
        </button>
        <button type="button" class="noted-btn" @click="markNoted">
          → Ya lo conocía
        </button>
      </div>
    </div>

    <div v-else class="finished-section">
      <div class="finished-icon">🧠</div>
      <h2 class="finished-title">¡Bien hecho!</h2>
      <p class="finished-subtitle">Ahora conoces estas trampas comunes</p>
      <p class="finished-stats">
        Aprendiste <strong>{{ learned }}</strong> nuevas trampas
      </p>
      <p class="finished-score">Puntos: {{ score }}</p>
      <button type="button" class="restart-btn" @click="reset">Repasar de nuevo</button>
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
  background: linear-gradient(90deg, #f59e0b, #dc2626);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 1.5rem;
}

.false-cognate-card {
  background: var(--surface-card);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: var(--radius-lg);
  padding: 2rem;
  margin-bottom: 1.5rem;
  box-shadow: var(--shadow-card);
}

.warning-header {
  margin-bottom: 1.5rem;
}

.warning-badge {
  display: inline-block;
  padding: 0.4rem 0.9rem;
  background: rgba(239, 68, 68, 0.16);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: var(--radius-full);
  color: #fca5a5;
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
  text-transform: capitalize;
}

.looks-like {
  text-align: center;
  margin-bottom: 1.5rem;
}

.label {
  display: block;
  color: var(--text-dim);
  font-size: 0.875rem;
  margin-bottom: 0.4rem;
}

.looks-like-word {
  display: inline-block;
  font-size: 1.5rem;
  font-weight: 700;
  color: #fbbf24;
  font-style: italic;
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

.reveal-section {
  text-align: center;
  padding: 1rem 0;
}

.reveal-btn {
  padding: 0.75rem 1.75rem;
  background: linear-gradient(90deg, #f59e0b, #dc2626);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reveal-btn:hover {
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.learned-btn, .noted-btn {
  padding: 0.85rem;
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.learned-btn {
  background: linear-gradient(90deg, #22c55e, #10b981);
}

.learned-btn:hover {
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
}

.noted-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-subtle);
}

.noted-btn:hover {
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
  margin-bottom: 0.5rem;
}

.finished-subtitle {
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.finished-stats {
  color: var(--text-muted);
  font-size: 1.05rem;
  margin-bottom: 0.5rem;
}

.finished-score {
  font-size: 1.25rem;
  color: #fbbf24;
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
