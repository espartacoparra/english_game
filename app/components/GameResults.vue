<script setup lang="ts">
import { computed } from 'vue'
import type { TenseKey } from '~/types/verb'

const props = defineProps<{
  attempts?: number
}>()

const { results, score, selectedVerbs, resetGame, mode } = useVerbGame()

const isCardMode = computed(() => mode.value === 'card-matching')
const totalVerbs = computed(() => selectedVerbs.value.length)

const tenseLabels: Record<TenseKey, string> = {
  base: 'Base',
  past: 'Pasado',
  participle: 'Participio',
}

const tenseOrder: TenseKey[] = ['base', 'past', 'participle']

function answersMatch(userAnswer: string, correctAnswer: string): boolean {
  return userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
}
</script>

<template>
  <div class="game-results">
    <h2 class="title">Resultados</h2>

    <div v-if="isCardMode" class="card-summary">
      <p class="message">¡Completado!</p>
      <p class="stat-line">Intentos totales: {{ attempts }}</p>
      <p class="stat-line">
        Grupos encontrados: {{ selectedVerbs.length }} de {{ selectedVerbs.length }}
      </p>
    </div>

    <div v-else class="write-summary">
      <p class="score">{{ score }} de {{ totalVerbs }} correctos</p>

      <ul class="result-list">
        <li v-for="result in results" :key="result.verb.base" class="result-item">
          <h3 class="verb-title">{{ result.verb.spanish }}</h3>
          <div class="answers">
            <div
              v-for="tense in tenseOrder"
              :key="tense"
              class="answer-row"
            >
              <span class="tense-label">{{ tenseLabels[tense] }}:</span>
              <span
                class="user-answer"
                :class="{
                  correct: answersMatch(result.userAnswers[tense], result.verb[tense]),
                  wrong: !answersMatch(result.userAnswers[tense], result.verb[tense]),
                }"
              >
                {{ result.userAnswers[tense] || '-' }}
              </span>
              <span class="correct-answer">{{ result.verb[tense] }}</span>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <button class="replay-button" @click="resetGame">Jugar de nuevo</button>
  </div>
</template>

<style scoped>
.game-results {
  max-width: 600px;
  margin: 0 auto;
  padding: 1rem;
}

.title {
  text-align: center;
  margin-bottom: 1.5rem;
}

.card-summary,
.write-summary {
  margin-bottom: 1.5rem;
}

.message {
  font-size: 1.25rem;
  font-weight: 600;
  color: #27ae60;
  text-align: center;
}

.stat-line {
  text-align: center;
  margin: 0.25rem 0;
}

.score {
  text-align: center;
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.result-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.result-item {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.verb-title {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
}

.answers {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.answer-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.tense-label {
  min-width: 80px;
  font-weight: 600;
}

.user-answer {
  min-width: 120px;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.user-answer.correct {
  background: #eafaf1;
  color: #27ae60;
}

.user-answer.wrong {
  background: #fdeaea;
  color: #c0392b;
}

.correct-answer {
  color: #666;
}

.replay-button {
  display: block;
  margin: 0 auto;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  background: #3498db;
  color: #fff;
  cursor: pointer;
  font-size: 1rem;
}

.replay-button:hover {
  background: #2980b9;
}
</style>
