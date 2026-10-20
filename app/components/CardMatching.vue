<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Card } from '~/composables/useVerbGame'
import GameResults from './GameResults.vue'

const { selectedVerbs, shuffleCards, normalizedCompare, resetGame } = useVerbGame()

const cards = ref<Card[]>(shuffleCards(selectedVerbs.value))
const selectedIds = ref<string[]>([])
const attempts = ref(0)
const matchedGroups = ref(0)
const feedback = ref('')
const totalGroups = computed(() => selectedVerbs.value.length)
const isComplete = computed(() => matchedGroups.value === totalGroups.value)

const selectedCards = computed(() =>
  cards.value.filter((card) => selectedIds.value.includes(card.id))
)

function cardIsSelected(card: Card): boolean {
  return selectedIds.value.includes(card.id)
}

function cardIsMatched(card: Card): boolean {
  return card.matched
}

function canSelectCard(card: Card): boolean {
  return !card.matched && !cardIsSelected(card) && selectedIds.value.length < 4
}

function selectCard(card: Card): void {
  if (!canSelectCard(card)) return
  selectedIds.value.push(card.id)

  if (selectedIds.value.length === 4) {
    validateSelection()
  }
}

function validateSelection(): void {
  attempts.value++
  const firstBase = selectedCards.value[0]?.verb.base ?? ''
  const allSameVerb = selectedCards.value.every((card) =>
    normalizedCompare(card.verb.base, firstBase)
  )

  if (allSameVerb) {
    selectedCards.value.forEach((card) => {
      card.matched = true
    })
    matchedGroups.value++
    feedback.value = '¡Grupo correcto!'
    selectedIds.value = []
  } else {
    feedback.value = 'Intenta de nuevo'
    setTimeout(() => {
      selectedIds.value = []
    }, 800)
  }
}
</script>

<template>
  <div v-if="!isComplete" class="card-matching">
    <h2 class="title">Empareja las cartas</h2>
    <p class="subtitle">Selecciona 4 cartas que correspondan al mismo verbo</p>

    <div class="stats">
      <span>{{ matchedGroups }} de {{ totalGroups }} grupos encontrados</span>
      <span>Intentos: {{ attempts }}</span>
    </div>

    <p
      v-if="feedback"
      class="feedback"
      :class="{ success: feedback === '¡Grupo correcto!' }"
    >
      {{ feedback }}
    </p>

    <div class="grid">
      <button
        v-for="card in cards"
        :key="card.id"
        class="card"
        :class="{
          selected: cardIsSelected(card),
          matched: cardIsMatched(card),
        }"
        :disabled="cardIsMatched(card)"
        @click="selectCard(card)"
      >
        {{ card.label }}
      </button>
    </div>

    <button class="reset-button" @click="resetGame">Reiniciar</button>
  </div>
  <GameResults v-else :attempts="attempts" />
</template>

<style scoped>
.card-matching {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.title {
  text-align: center;
  margin-bottom: 0.5rem;
}

.subtitle {
  text-align: center;
  color: #666;
  margin-bottom: 1rem;
}

.stats {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
  font-weight: 600;
}

.feedback {
  text-align: center;
  margin-bottom: 1rem;
  font-weight: 600;
  color: #c0392b;
}

.feedback.success {
  color: #27ae60;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.card {
  aspect-ratio: 1;
  padding: 1rem;
  border: 2px solid #ddd;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.card:hover:not(:disabled) {
  border-color: #3498db;
  transform: translateY(-2px);
}

.card.selected {
  border-color: #3498db;
  background: #eaf5ff;
}

.card.matched {
  border-color: #27ae60;
  background: #eafaf1;
  cursor: default;
}

.reset-button {
  display: block;
  margin: 0 auto;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  background: #e74c3c;
  color: #fff;
  cursor: pointer;
  font-size: 1rem;
}

.reset-button:hover {
  background: #c0392b;
}
</style>
