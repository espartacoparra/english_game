<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { verbs } from '~/data/verbs'
import { useVerbGame } from '~/composables/useVerbGame'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '~/core/room-client'
import type { GameMode, VerbLevel, VerbType } from '~/types/verb'

const router = useRouter()
const { setupGame, filterVerbs } = useVerbGame()

type PlayTarget = 'solo' | 'multiplayer'

const playTarget = ref<PlayTarget>('solo')
const joinCodeInput = ref('')
const joinCodeError = ref('')

const selectedType = ref<VerbType | 'all'>('all')
const selectedLevel = ref<VerbLevel | 'all'>('all')
const selectedCount = ref<number | 'all'>(10)
const selectedMode = ref<GameMode>('write-all')

const countOptions = [5, 10, 20, 50] as const

const targetOptions: { id: PlayTarget; title: string; desc: string; icon: string }[] = [
  {
    id: 'solo',
    title: 'Solo (Single Player)',
    desc: 'Practica a tu ritmo con rachas, pronunciación y estadísticas personales.',
    icon: '👤',
  },
  {
    id: 'multiplayer',
    title: 'Multijugador (Sala en vivo)',
    desc: 'Crea una sala en tiempo real con estos ajustes y compite con amigos.',
    icon: '👥',
  },
]

const typeOptions: { label: string; value: VerbType | 'all'; desc: string }[] = [
  { label: 'Todos', value: 'all', desc: `${verbs.length} verbos en total` },
  { label: 'Irregulares', value: 'irregular', desc: `${verbs.filter(v => v.type === 'irregular').length} esenciales (be, go, see...)` },
  { label: 'Regulares', value: 'regular', desc: `${verbs.filter(v => v.type === 'regular').length} frecuentes (-ed)` },
]

const levelOptions: { label: string; value: VerbLevel | 'all'; tag: string }[] = [
  { label: 'Todos los niveles', value: 'all', tag: 'A1-B2' },
  { label: 'A1 Básico', value: 'A1', tag: 'Principiante' },
  { label: 'A2 Elemental', value: 'A2', tag: 'Intermedio bajo' },
  { label: 'B1 Intermedio', value: 'B1', tag: 'Intermedio' },
  { label: 'B2 Avanzado', value: 'B2', tag: 'Avanzado' },
]

const modeOptions: {
  id: GameMode
  title: string
  desc: string
  icon: string
  difficulty: string
}[] = [
  {
    id: 'write-all',
    title: 'Escribir los 3 tiempos',
    desc: 'Practica Infinitivo (Base), Pasado Simple y Participio con pronunciación y streak.',
    icon: '✍️',
    difficulty: 'Recomendado',
  },
  {
    id: 'fill-missing',
    title: 'Completar tiempo faltante',
    desc: 'Te damos uno o dos tiempos como pista; escribe o deduce el tiempo ausente.',
    icon: '🧩',
    difficulty: 'Dinámico',
  },
  {
    id: 'card-matching',
    title: 'Emparejar Tarjetas',
    desc: 'Asocia rápidamente el significado en español con su tiempo en inglés en rondas ágiles.',
    icon: '🃏',
    difficulty: 'Visual & Rápido',
  },
]

// Real-time pool calculation
const filteredPool = computed(() => {
  return filterVerbs(selectedType.value, selectedLevel.value)
})

const effectiveCount = computed(() => {
  if (selectedCount.value === 'all') return filteredPool.value.length
  return Math.min(selectedCount.value, filteredPool.value.length)
})

function handleAction() {
  if (playTarget.value === 'solo') {
    setupGame(selectedMode.value, selectedCount.value, selectedType.value, selectedLevel.value)
  } else {
    const code = generateRoomCode()
    const query = new URLSearchParams({
      mode: selectedMode.value,
      count: String(selectedCount.value),
      type: selectedType.value,
      level: selectedLevel.value,
    })
    router.push(`/room/${code}?${query.toString()}`)
  }
}

function handleJoinRoom() {
  joinCodeError.value = ''
  const code = normalizeRoomCode(joinCodeInput.value)
  if (!isValidRoomCode(code)) {
    joinCodeError.value = 'El código debe tener 6 letras o números (ej: ABC123)'
    return
  }
  router.push(`/room/${code}`)
}
</script>

<template>
  <div class="setup-container animate-pop">
    <!-- Hero Header -->
    <header class="hero">
      <div class="hero-badge">
        <span class="pulse-dot" />
        <span>{{ verbs.length }} Verbos disponibles (Regulares + Irregulares)</span>
      </div>
      <h1 class="hero-title">
        Domina los <span class="gradient-text">Verbos en Inglés</span>
      </h1>
      <p class="hero-subtitle">
        Aprende, conjuga y memoriza la forma base, pasado simple y participio pasado con pronunciación nativa.
      </p>
    </header>

    <div class="setup-grid">
      <!-- Left Column: Filters -->
      <div class="setup-card">
        <!-- Target Selector: Solo vs Multiplayer -->
        <section class="section">
          <label class="section-label">0. ¿Cómo quieres jugar?</label>
          <div class="target-grid">
            <button
              v-for="opt in targetOptions"
              :key="opt.id"
              type="button"
              class="target-btn"
              :class="{ active: playTarget === opt.id }"
              @click="playTarget = opt.id"
            >
              <span class="target-icon">{{ opt.icon }}</span>
              <div class="target-info">
                <span class="target-title">{{ opt.title }}</span>
                <span class="target-desc">{{ opt.desc }}</span>
              </div>
            </button>
          </div>
        </section>

        <!-- Filter 1: Type -->
        <section class="section">
          <label class="section-label">1. Tipo de verbos</label>
          <div class="segmented-control">
            <button
              v-for="opt in typeOptions"
              :key="opt.value"
              type="button"
              class="segment-btn"
              :class="{ active: selectedType === opt.value }"
              @click="selectedType = opt.value"
            >
              <span class="btn-title">{{ opt.label }}</span>
              <span class="btn-sub">{{ opt.desc }}</span>
            </button>
          </div>
        </section>

        <!-- Filter 2: CEFR Level -->
        <section class="section">
          <label class="section-label">2. Nivel de dificultad (MCER)</label>
          <div class="chip-group">
            <button
              v-for="lvl in levelOptions"
              :key="lvl.value"
              type="button"
              class="chip-btn"
              :class="{ active: selectedLevel === lvl.value }"
              @click="selectedLevel = lvl.value"
            >
              <span>{{ lvl.label }}</span>
            </button>
          </div>
        </section>

        <!-- Filter 3: Verb Count -->
        <section class="section">
          <div class="section-header">
            <label class="section-label">3. Cantidad de verbos</label>
            <span class="available-counter">
              {{ filteredPool.length }} disponibles según filtros
            </span>
          </div>

          <div class="count-grid">
            <button
              v-for="cnt in countOptions"
              :key="cnt"
              type="button"
              class="count-btn"
              :class="{ active: selectedCount === cnt }"
              :disabled="filteredPool.length < cnt && cnt !== 5"
              @click="selectedCount = cnt"
            >
              {{ cnt }}
            </button>
            <button
              type="button"
              class="count-btn count-btn--all"
              :class="{ active: selectedCount === 'all' }"
              @click="selectedCount = 'all'"
            >
              Todos ({{ filteredPool.length }})
            </button>
          </div>
        </section>
      </div>

      <!-- Right Column: Game Modes & CTA -->
      <div class="setup-card setup-card--modes">
        <label class="section-label">4. Selecciona el modo de práctica</label>
        <div class="modes-list">
          <div
            v-for="m in modeOptions"
            :key="m.id"
            class="mode-card"
            :class="{ active: selectedMode === m.id }"
            @click="selectedMode = m.id"
          >
            <div class="mode-icon">{{ m.icon }}</div>
            <div class="mode-info">
              <div class="mode-header-line">
                <h3 class="mode-title">{{ m.title }}</h3>
                <span class="mode-tag">{{ m.difficulty }}</span>
              </div>
              <p class="mode-desc">{{ m.desc }}</p>
            </div>
            <div class="mode-radio">
              <div class="radio-circle" :class="{ checked: selectedMode === m.id }" />
            </div>
          </div>
        </div>

        <button
          class="cta-button"
          :class="{ 'cta-button--multi': playTarget === 'multiplayer' }"
          type="button"
          @click="handleAction"
        >
          <template v-if="playTarget === 'solo'">
            <span>Comenzar práctica solo</span>
            <span class="cta-sub">({{ effectiveCount }} verbos seleccionados) →</span>
          </template>
          <template v-else>
            <span>Crear sala multijugador</span>
            <span class="cta-sub">(Invitar amigos con estos ajustes) 👥 →</span>
          </template>
        </button>

        <!-- Join existing room option -->
        <div class="join-room-box">
          <span class="join-room-title">¿Ya tienes un código de sala?</span>
          <div class="join-room-form">
            <input
              v-model="joinCodeInput"
              type="text"
              class="join-room-input"
              placeholder="Ej: ABC123"
              maxlength="6"
              @keyup.enter="handleJoinRoom"
            />
            <button type="button" class="join-room-btn" @click="handleJoinRoom">
              Unirme
            </button>
          </div>
          <p v-if="joinCodeError" class="join-room-error">{{ joinCodeError }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-container {
  max-width: 1040px;
  margin: 0 auto;
  padding: 2.5rem 1.25rem 4rem;
}

.hero {
  text-align: center;
  margin-bottom: 2.5rem;
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

/* Grid Layout */
.setup-grid {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 1.5rem;
}

@media (max-width: 860px) {
  .setup-grid {
    grid-template-columns: 1fr;
  }
}

.setup-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.section-label {
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.available-counter {
  font-size: 0.775rem;
  color: var(--primary-light);
  font-weight: 600;
}

/* Segmented Control */
.segmented-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.segment-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.segment-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.segment-btn.active {
  background: rgba(99, 102, 241, 0.16);
  border-color: var(--primary);
  color: #fff;
}

.btn-title {
  font-size: 0.95rem;
  font-weight: 700;
}

.btn-sub {
  font-size: 0.775rem;
  color: var(--text-dim);
  margin-top: 0.15rem;
}

.segment-btn.active .btn-sub {
  color: #c7d2fe;
}

/* Chips */
.chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.chip-btn {
  padding: 0.5rem 0.85rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 0.825rem;
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

/* Count Grid */
.count-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr) 1.5fr;
  gap: 0.5rem;
}

@media (max-width: 500px) {
  .count-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .count-btn--all {
    grid-column: span 2;
  }
}

.count-btn {
  padding: 0.65rem 0.5rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.count-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.07);
}

.count-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.count-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Modes List */
.modes-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.mode-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.mode-card.active {
  background: rgba(99, 102, 241, 0.14);
  border-color: var(--primary);
  box-shadow: 0 4px 18px rgba(99, 102, 241, 0.2);
}

.mode-icon {
  font-size: 1.8rem;
  line-height: 1;
}

.mode-info {
  flex: 1;
}

.mode-header-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.mode-title {
  font-size: 0.975rem;
  font-weight: 700;
  color: #fff;
}

.mode-tag {
  font-size: 0.675rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: var(--radius-full);
  background: rgba(99, 102, 241, 0.25);
  color: #c7d2fe;
}

.mode-desc {
  font-size: 0.8rem;
  color: var(--text-dim);
  line-height: 1.4;
}

.radio-circle {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--border-subtle);
  transition: all 0.2s ease;
}

.radio-circle.checked {
  border-color: var(--primary);
  background: var(--primary);
  box-shadow: inset 0 0 0 3px #0f172a;
}

/* CTA Button */
.cta-button {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 1rem 1.5rem;
  background: var(--primary-gradient);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px var(--primary-glow);
  transition: all 0.2s ease;
}

.cta-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 30px rgba(99, 102, 241, 0.5);
  filter: brightness(1.08);
}

.cta-button:active {
  transform: translateY(0);
}

.cta-button--multi {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 8px 24px rgba(16, 185, 129, 0.35);
}

.cta-button--multi:hover {
  box-shadow: 0 12px 30px rgba(16, 185, 129, 0.5);
}

/* Target Selector */
.target-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.65rem;
}

.target-btn {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 1rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.target-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
}

.target-btn.active {
  background: rgba(99, 102, 241, 0.12);
  border-color: var(--primary);
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.2);
}

.target-icon {
  font-size: 1.5rem;
}

.target-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.target-title {
  font-size: 0.925rem;
  font-weight: 700;
  color: #fff;
}

.target-desc {
  font-size: 0.775rem;
  color: var(--text-dim);
  line-height: 1.35;
}

/* Join Room Box */
.join-room-box {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.join-room-title {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 600;
}

.join-room-form {
  display: flex;
  gap: 0.5rem;
}

.join-room-input {
  flex: 1;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.55rem 0.75rem;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.join-room-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.25);
}

.join-room-btn {
  padding: 0.55rem 1rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.join-room-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
}

.join-room-error {
  font-size: 0.775rem;
  color: #f87171;
  margin: 0;
}

.cta-sub {
  font-size: 0.8rem;
  font-weight: 500;
  opacity: 0.9;
}
</style>
