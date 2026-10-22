<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch, type Component } from 'vue'
import GameSetup from '~/components/GameSetup.vue'
import MainMenu from '~/components/MainMenu.vue'
import StatsPanel from '~/components/StatsPanel.vue'
import VerbLibrary from '~/components/VerbLibrary.vue'
import { useVerbGame } from '~/composables/useVerbGame'
import type { GameMode, Verb } from '~/types/verb'

const WriteAllTenses = defineAsyncComponent(() => import('~/components/WriteAllTenses.vue'))
const FillMissingTense = defineAsyncComponent(() => import('~/components/FillMissingTense.vue'))
const CardMatching = defineAsyncComponent(() => import('~/components/CardMatching.vue'))
const GameResults = defineAsyncComponent(() => import('~/components/GameResults.vue'))

type Section = 'menu' | 'practice' | 'stats' | 'verbs'

const { mode, isFinished, selectedVerbs, resetGame, setupCustomVerbsGame } = useVerbGame()

const section = ref<Section>('menu')

const navLinks: { id: Section; label: string; short: string }[] = [
  { id: 'menu', label: 'Menú', short: 'Menú' },
  { id: 'practice', label: 'Practicar', short: 'Practicar' },
  { id: 'stats', label: 'Estadísticas', short: 'Stats' },
  { id: 'verbs', label: 'Verbos', short: 'Verbos' },
]

const modeComponents: Record<GameMode, Component> = {
  'write-all': WriteAllTenses,
  'fill-missing': FillMissingTense,
  'card-matching': CardMatching,
}

const isSessionActive = computed(() => selectedVerbs.value.length > 0)

function goToSection(next: Section) {
  section.value = next
}

function goHome() {
  resetGame()
  section.value = 'menu'
}

function startCustomPractice(verbList: Verb[]) {
  if (verbList.length === 0) return
  setupCustomVerbsGame(verbList, 'write-all')
}

// When a session ends back to the hub, land on the menu instead of the setup screen.
watch(
  () => selectedVerbs.value.length,
  (next, previous) => {
    if (previous > 0 && next === 0) {
      section.value = 'menu'
    }
  }
)
</script>

<template>
  <div class="app-layout">
    <!-- Navbar / Brand -->
    <header class="app-navbar">
      <div class="navbar-content">
        <div class="brand" @click="goHome">
          <div class="brand-logo">⚡</div>
          <div class="brand-text">
            <span class="brand-name">VerbMaster</span>
            <span class="brand-tag">English Mastery</span>
          </div>
        </div>

        <nav v-if="!isSessionActive" class="nav-links" aria-label="Secciones">
          <button
            v-for="link in navLinks"
            :key="link.id"
            type="button"
            class="nav-link"
            :class="{ active: section === link.id }"
            :aria-current="section === link.id ? 'page' : undefined"
            @click="goToSection(link.id)"
          >
            <span class="nav-label">{{ link.label }}</span>
            <span class="nav-label-short">{{ link.short }}</span>
          </button>
        </nav>

        <div class="navbar-actions">
          <button
            v-if="isSessionActive"
            type="button"
            class="nav-reset-btn"
            @click="goHome"
          >
            ← Menú
          </button>
        </div>
      </div>
    </header>

    <main class="page-content">
      <template v-if="!isSessionActive">
        <MainMenu v-if="section === 'menu'" @navigate="goToSection" />
        <GameSetup v-else-if="section === 'practice'" />
        <StatsPanel v-else-if="section === 'stats'" @practice="startCustomPractice" />
        <VerbLibrary v-else-if="section === 'verbs'" @practice="startCustomPractice" />
      </template>

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
  gap: 0.75rem;
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

/* Section navigation */
.nav-links {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
}

.nav-link {
  padding: 0.4rem 0.85rem;
  background: transparent;
  border: none;
  border-radius: var(--radius-full);
  color: var(--text-muted);
  font-family: inherit;
  font-size: 0.825rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-link.active {
  background: var(--primary-gradient);
  color: #fff;
  box-shadow: 0 4px 12px var(--primary-glow);
}

.nav-label-short {
  display: none;
}

@media (max-width: 720px) {
  .brand-tag {
    display: none;
  }
  .nav-links {
    gap: 0.1rem;
  }
  .nav-link {
    padding: 0.35rem 0.55rem;
    font-size: 0.75rem;
  }
}

@media (max-width: 520px) {
  .nav-label {
    display: none;
  }
  .nav-label-short {
    display: inline;
  }
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
