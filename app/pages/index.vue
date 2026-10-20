<script setup lang="ts">
import type { Component } from 'vue'
import GameSetup from '~/components/GameSetup.vue'
import WriteAllTenses from '~/components/WriteAllTenses.vue'
import FillMissingTense from '~/components/FillMissingTense.vue'
import CardMatching from '~/components/CardMatching.vue'
import GameResults from '~/components/GameResults.vue'
import { useVerbGame } from '~/composables/useVerbGame'
import type { GameMode } from '~/types/verb'

const { mode, isFinished, selectedVerbs } = useVerbGame()

const modeComponents: Record<GameMode, Component> = {
  'write-all': WriteAllTenses,
  'fill-missing': FillMissingTense,
  'card-matching': CardMatching,
}
</script>

<template>
  <main class="page">
    <GameSetup v-if="selectedVerbs.length === 0" />

    <template v-else>
      <Component :is="modeComponents[mode]" v-if="!isFinished" />
      <GameResults v-else />
    </template>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
}
</style>
