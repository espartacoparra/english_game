<script setup lang="ts">
import { defineAsyncComponent, type Component } from 'vue'
import GameSetup from '~/components/GameSetup.vue'
import { useVerbGame } from '~/composables/useVerbGame'
import type { GameMode } from '~/types/verb'

const WriteAllTenses = defineAsyncComponent(() => import('~/components/WriteAllTenses.vue'))
const FillMissingTense = defineAsyncComponent(() => import('~/components/FillMissingTense.vue'))
const CardMatching = defineAsyncComponent(() => import('~/components/CardMatching.vue'))
const GameResults = defineAsyncComponent(() => import('~/components/GameResults.vue'))

const { mode, isFinished, selectedVerbs, resetGame } = useVerbGame()

const modeComponents: Record<GameMode, Component> = {
  'write-all': WriteAllTenses,
  'fill-missing': FillMissingTense,
  'card-matching': CardMatching,
}
</script>

<template>
  <div class="app-layout">
    <!-- Navbar / Brand -->
    <header class="app-navbar">
      <div class="navbar-content">
        <div class="brand" @click="resetGame">
          <div class="brand-logo">⚡</div>
          <div class="brand-text">
            <span class="brand-name">VerbMaster</span>
            <span class="brand-tag">English Mastery</span>
          </div>
        </div>

        <div class="navbar-actions">
          <button
            v-if="selectedVerbs.length > 0"
            type="button"
            class="nav-reset-btn"
            @click="resetGame"
          >
            ← Menú
          </button>
        </div>
      </div>
    </header>

    <main class="page-content">
      <GameSetup v-if="selectedVerbs.length === 0" />

      <template v-else>
        <Component :is="modeComponents[mode]" v-if="!isFinished" />
        <GameResults v-else />
      </template>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-navbar {
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(7, 9, 14, 0.7);
  backdrop-filter: blur(16px);
  position: sticky;
  top: 0;
  z-index: 50;
}

.navbar-content {
  max-width: 1040px;
  margin: 0 auto;
  padding: 0.85rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  cursor: pointer;
  user-select: none;
}

.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  background: var(--primary-gradient);
  border-radius: var(--radius-sm);
  font-size: 1.15rem;
  box-shadow: 0 0 15px var(--primary-glow);
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-name {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}

.brand-tag {
  font-size: 0.675rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary-light);
}

.nav-reset-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  padding: 0.45rem 0.85rem;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-reset-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.page-content {
  flex: 1;
}
</style>
