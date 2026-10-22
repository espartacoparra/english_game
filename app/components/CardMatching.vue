<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useVerbGame } from '~/composables/useVerbGame'
import type { TenseKey, Verb } from '~/types/verb'
import GameResults from './GameResults.vue'

type Stage = 'spanish' | 'base' | 'past' | 'participle'

interface StageOption {
  id: string
  label: string
  verb: Verb
  correct: boolean
}

const { selectedVerbs, normalizedCompare, resetGame } = useVerbGame()

const ROUND_SIZE = 4
const roundIndex = ref(0)
const attempts = ref(0)
const feedback = ref('')
const feedbackType = ref<'success' | 'error' | ''>('')
const shakeError = ref(false)

const stage = ref<Stage>('spanish')
const targetVerb = ref<Verb | null>(null)
const completedVerbBases = ref<string[]>([])
const matchedGroupCount = ref(0)

const totalVerbs = computed(() => selectedVerbs.value.length)
const totalRounds = computed(() => Math.ceil(totalVerbs.value / ROUND_SIZE))

const currentRoundVerbs = computed(() => {
  const start = roundIndex.value * ROUND_SIZE
  return selectedVerbs.value.slice(start, start + ROUND_SIZE)
})

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Current options displayed on screen based on the active stage
const currentOptions = ref<StageOption[]>([])

function updateOptions() {
  const round = currentRoundVerbs.value

  if (stage.value === 'spanish') {
    // Show only verbs in this round that haven't been completed yet
    const remaining = round.filter((v) => !completedVerbBases.value.includes(v.base))
    currentOptions.value = shuffle(
      remaining.map((v) => ({
        id: `sp-${v.base}`,
        label: v.spanish,
        verb: v,
        correct: true,
      }))
    )
    return
  }

  if (!targetVerb.value) return

  // For tense stages, generate options using round verbs
  const tenseKey: TenseKey = stage.value as TenseKey
  currentOptions.value = shuffle(
    round.map((v) => ({
      id: `${tenseKey}-${v.base}`,
      label: v[tenseKey],
      verb: v,
      correct: normalizedCompare(v[tenseKey], targetVerb.value![tenseKey]),
    }))
  )
}

watch([stage, roundIndex, completedVerbBases], () => {
  updateOptions()
}, { immediate: true })

const roundFinished = computed(() => {
  return (
    currentRoundVerbs.value.length > 0 &&
    completedVerbBases.value.length === currentRoundVerbs.value.length
  )
})

const gameFinished = computed(() => {
  return roundIndex.value >= totalRounds.value - 1 && roundFinished.value
})

function handleCardClick(opt: StageOption) {
  feedback.value = ''
  feedbackType.value = ''

  if (stage.value === 'spanish') {
    // Step 1: User selects the Spanish verb
    targetVerb.value = opt.verb
    stage.value = 'base'
    feedback.value = `¡Seleccionado! Ahora busca el Infinitivo de "${opt.verb.spanish}"`
    feedbackType.value = 'success'
    return
  }

  // Steps 2, 3, 4: Validate tense selection
  attempts.value++

  if (opt.correct) {
    if (stage.value === 'base') {
      stage.value = 'past'
      feedback.value = `¡Correcto! Ahora busca el Pasado Simple`
      feedbackType.value = 'success'
    } else if (stage.value === 'past') {
      stage.value = 'participle'
      feedback.value = `¡Muy bien! Ahora busca el Participio Pasado`
      feedbackType.value = 'success'
    } else if (stage.value === 'participle') {
      // Completed all 4 forms for this verb!
      if (targetVerb.value) {
        completedVerbBases.value.push(targetVerb.value.base)
        matchedGroupCount.value++
      }

      feedback.value = `¡Excelente! Has dominado todas las formas de "${targetVerb.value?.spanish}"`
      feedbackType.value = 'success'

      // Check if round is complete
      if (completedVerbBases.value.length < currentRoundVerbs.value.length) {
        setTimeout(() => {
          targetVerb.value = null
          stage.value = 'spanish'
          feedback.value = ''
          feedbackType.value = ''
        }, 900)
      }
    }
  } else {
    // Wrong card picked
    shakeError.value = true
    feedback.value = `Incorrecto. Esa carta no corresponde al verbo actual.`
    feedbackType.value = 'error'
    setTimeout(() => {
      shakeError.value = false
    }, 500)
  }
}

function cancelSelection() {
  targetVerb.value = null
  stage.value = 'spanish'
  feedback.value = ''
  feedbackType.value = ''
}

function nextRound() {
  roundIndex.value++
  completedVerbBases.value = []
  targetVerb.value = null
  stage.value = 'spanish'
  feedback.value = ''
  feedbackType.value = ''
}

const stageTitle = computed(() => {
  switch (stage.value) {
    case 'spanish':
      return 'Paso 1: Elige un verbo en español'
    case 'base':
      return 'Paso 2: Selecciona el Infinitivo (Base)'
    case 'past':
      return 'Paso 3: Selecciona el Pasado Simple'
    case 'participle':
      return 'Paso 4: Selecciona el Participio Pasado'
  }
})

const stageSubtitle = computed(() => {
  if (stage.value === 'spanish') {
    return 'Toca una tarjeta para comenzar la cadena de conjugación.'
  }
  return `Buscando la conjugación para: "${targetVerb.value?.spanish}"`
})
</script>

<template>
  <div v-if="!gameFinished" class="card-matching-wrapper animate-pop">
    <!-- Top Header -->
    <header class="game-header">
      <button class="exit-btn" type="button" @click="resetGame">
        ← Menú principal
      </button>

      <div class="stats-pills">
        <span class="stat-pill">
          Ronda {{ roundIndex + 1 }} de {{ totalRounds }}
        </span>
        <span class="stat-pill">
          Intentos: {{ attempts }}
        </span>
        <span class="stat-pill stat-pill--highlight">
          Verbos completados: {{ matchedGroupCount }} / {{ totalVerbs }}
        </span>
      </div>
    </header>

    <div class="game-card">
      <!-- Breadcrumb Stage Progress -->
      <nav class="stages-stepper">
        <div class="step-item" :class="{ active: stage === 'spanish', completed: stage !== 'spanish' }">
          <span class="step-num">1</span>
          <span class="step-text">Español</span>
        </div>
        <span class="step-arrow">→</span>

        <div class="step-item" :class="{ active: stage === 'base', completed: stage === 'past' || stage === 'participle' }">
          <span class="step-num">2</span>
          <span class="step-text">Infinitivo</span>
        </div>
        <span class="step-arrow">→</span>

        <div class="step-item" :class="{ active: stage === 'past', completed: stage === 'participle' }">
          <span class="step-num">3</span>
          <span class="step-text">Pasado</span>
        </div>
        <span class="step-arrow">→</span>

        <div class="step-item" :class="{ active: stage === 'participle' }">
          <span class="step-num">4</span>
          <span class="step-text">Participio</span>
        </div>
      </nav>

      <!-- Target Verb Banner when in conjugations -->
      <div v-if="targetVerb && stage !== 'spanish'" class="target-verb-banner">
        <div class="target-info">
          <span class="target-label">Verbo en curso:</span>
          <span class="target-spanish">{{ targetVerb.spanish }}</span>
          <span class="badge" :class="targetVerb.type === 'irregular' ? 'badge-irregular' : 'badge-regular'">
            {{ targetVerb.type }}
          </span>
        </div>

        <button type="button" class="cancel-verb-btn" @click="cancelSelection">
          ✕ Elegir otro
        </button>
      </div>

      <!-- Prompt Info -->
      <div class="prompt-box">
        <h2 class="title">{{ stageTitle }}</h2>
        <p class="subtitle">{{ stageSubtitle }}</p>
      </div>

      <!-- Feedback Banner -->
      <div
        v-if="feedback"
        class="feedback-banner"
        :class="{
          'feedback--success': feedbackType === 'success',
          'feedback--error': feedbackType === 'error',
        }"
      >
        <span>{{ feedback }}</span>
      </div>

      <!-- Cards Grid -->
      <div v-if="!roundFinished" class="grid" :class="{ 'animate-shake': shakeError }">
        <button
          v-for="opt in currentOptions"
          :key="opt.id"
          type="button"
          class="verb-card animate-pop"
          :class="`card--${stage}`"
          @click="handleCardClick(opt)"
        >
          <span class="card-stage-tag">
            {{
              stage === 'spanish' ? 'Español' :
              stage === 'base' ? 'Infinitivo' :
              stage === 'past' ? 'Pasado' : 'Participio'
            }}
          </span>
          <span class="card-text">{{ opt.label }}</span>
        </button>
      </div>

      <!-- Round complete banner -->
      <div v-if="roundFinished && roundIndex < totalRounds - 1" class="round-complete-box animate-pop">
        <p class="round-msg">¡Ronda {{ roundIndex + 1 }} completada con éxito!</p>
        <p class="round-sub">Has completado los {{ currentRoundVerbs.length }} verbos de esta ronda.</p>
        <button class="next-round-btn" type="button" @click="nextRound">
          Pasar a la siguiente ronda →
        </button>
      </div>
    </div>
  </div>

  <GameResults v-else :attempts="attempts" />
</template>

<style scoped>
.card-matching-wrapper {
  max-width: 820px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
}

.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.exit-btn {
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 0.5rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.825rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.exit-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.stats-pills {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.stat-pill {
  padding: 0.35rem 0.75rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
}

.stat-pill--highlight {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.35);
  color: #c7d2fe;
}

.game-card {
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 2rem;
  backdrop-filter: blur(20px);
  box-shadow: var(--shadow-card);
}

@media (max-width: 500px) {
  .game-card {
    padding: 1.25rem;
  }
}

/* Stepper */
.stages-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  font-size: 0.775rem;
  color: var(--text-dim);
  font-weight: 600;
  transition: all 0.2s ease;
}

.step-item.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: var(--primary);
  color: #fff;
  box-shadow: 0 0 12px var(--primary-glow);
}

.step-item.completed {
  border-color: rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.7rem;
}

.step-arrow {
  color: var(--text-dim);
  font-size: 0.85rem;
}

/* Target Verb Banner */
.target-verb-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: var(--radius-md);
  margin-bottom: 1.5rem;
}

.target-info {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.target-label {
  font-size: 0.8rem;
  color: var(--text-dim);
  text-transform: uppercase;
  font-weight: 700;
}

.target-spanish {
  font-size: 1.25rem;
  font-weight: 800;
  color: #fff;
}

.cancel-verb-btn {
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 0.35rem 0.65rem;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-verb-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.prompt-box {
  text-align: center;
  margin-bottom: 1.5rem;
}

.title {
  font-size: 1.6rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.02em;
}

.subtitle {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-top: 0.35rem;
}

.feedback-banner {
  padding: 0.65rem 1rem;
  border-radius: var(--radius-sm);
  text-align: center;
  font-weight: 700;
  font-size: 0.9rem;
  margin-bottom: 1.25rem;
}

.feedback--success {
  background: var(--success-bg);
  border: 1px solid var(--success-border);
  color: #6ee7b7;
}

.feedback--error {
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  color: #fda4af;
}

/* Grid */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

@media (max-width: 550px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.verb-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  min-height: 95px;
  padding: 1rem 0.75rem;
  background: var(--surface-inset);
  border: 2px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: center;
}

.verb-card:hover {
  border-color: rgba(99, 102, 241, 0.6);
  background: rgba(99, 102, 241, 0.12);
  transform: translateY(-2px);
}

.card-stage-tag {
  font-size: 0.675rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}

.card-text {
  font-size: 1.15rem;
  font-weight: 700;
  font-family: var(--font-mono);
}

.round-complete-box {
  text-align: center;
  margin-top: 1.5rem;
  padding: 1.5rem;
  background: rgba(99, 102, 241, 0.12);
  border-radius: var(--radius-md);
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.round-msg {
  font-size: 1.15rem;
  font-weight: 800;
  color: #c7d2fe;
}

.round-sub {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin: 0.35rem 0 1rem;
}

.next-round-btn {
  padding: 0.85rem 1.75rem;
  background: var(--primary-gradient);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  box-shadow: 0 4px 15px var(--primary-glow);
  transition: all 0.2s ease;
}

.next-round-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
</style>
