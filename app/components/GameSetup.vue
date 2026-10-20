<script setup lang="ts">
import { ref } from 'vue'
import { verbs } from '~/data/verbs'
import { useVerbGame } from '~/composables/useVerbGame'
import type { GameMode } from '~/types/verb'

const { setupGame } = useVerbGame()

const countOptions = [5, 10, 15, 20] as const
const selectedCount = ref<number | 'all'>(10)
const selectedMode = ref<GameMode>('write-all')

const modeOptions: { label: string; value: GameMode }[] = [
  { label: 'Escribir todos los tiempos', value: 'write-all' },
  { label: 'Completar el tiempo faltante', value: 'fill-missing' },
  { label: 'Agrupar tarjetas', value: 'card-matching' },
]

function startGame() {
  const count = selectedCount.value === 'all' ? verbs.length : selectedCount.value
  setupGame(selectedMode.value, count)
}
</script>

<template>
  <div class="setup-container">
    <h1 class="title">Práctica de verbos en inglés</h1>

    <section class="section">
      <h2 class="section-title">¿Cuántos verbos quieres practicar?</h2>
      <div class="options">
        <label
          v-for="option in countOptions"
          :key="option"
          class="option"
          :class="{ active: selectedCount === option }"
        >
          <input
            v-model="selectedCount"
            type="radio"
            name="verb-count"
            :value="option"
            class="sr-only"
          />
          <span class="option-label">{{ option }}</span>
        </label>
        <label
          class="option"
          :class="{ active: selectedCount === 'all' }"
        >
          <input
            v-model="selectedCount"
            type="radio"
            name="verb-count"
            value="all"
            class="sr-only"
          />
          <span class="option-label">Todos ({{ verbs.length }})</span>
        </label>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Elige un modo de juego</h2>
      <div class="options options--column">
        <label
          v-for="option in modeOptions"
          :key="option.value"
          class="option option--wide"
          :class="{ active: selectedMode === option.value }"
        >
          <input
            v-model="selectedMode"
            type="radio"
            name="game-mode"
            :value="option.value"
            class="sr-only"
          />
          <span class="option-label">{{ option.label }}</span>
        </label>
      </div>
    </section>

    <button class="start-button" type="button" @click="startGame">
      Empezar
    </button>
  </div>
</template>

<style scoped>
.setup-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1f2937;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
}

.title {
  margin: 0 0 2rem;
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  color: #111827;
}

.section {
  width: 100%;
  max-width: 28rem;
  margin-bottom: 1.5rem;
}

.section-title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  color: #374151;
}

.options {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.options--column {
  flex-direction: column;
  align-items: stretch;
}

.option {
  cursor: pointer;
  border-radius: 0.5rem;
  border: 2px solid #d1d5db;
  background-color: #ffffff;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.option:hover {
  border-color: #9ca3af;
}

.option.active {
  border-color: #2563eb;
  background-color: #eff6ff;
}

.option-label {
  display: block;
  padding: 0.75rem 1.25rem;
  font-weight: 500;
  text-align: center;
}

.option--wide .option-label {
  text-align: left;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.start-button {
  margin-top: 1rem;
  padding: 0.875rem 2.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: #ffffff;
  background-color: #2563eb;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.start-button:hover {
  background-color: #1d4ed8;
}

.start-button:active {
  background-color: #1e40af;
}
</style>
