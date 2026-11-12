<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch, type Component } from 'vue'
import GameSetup from '~/components/GameSetup.vue'
import MainMenu from '~/components/MainMenu.vue'
import StatsPanel from '~/components/StatsPanel.vue'
import VerbLibrary from '~/components/VerbLibrary.vue'
import SynonymsPractice from '~/components/SynonymsPractice.vue'
import AntonymsPractice from '~/components/AntonymsPractice.vue'
import CognatesPractice from '~/components/CognatesPractice.vue'
import FalseCognatesPractice from '~/components/FalseCognatesPractice.vue'
import { useVerbGame } from '~/composables/useVerbGame'
import type { GameMode, Verb } from '~/types/verb'

const WriteAllTenses = defineAsyncComponent(() => import('~/components/WriteAllTenses.vue'))
const FillMissingTense = defineAsyncComponent(() => import('~/components/FillMissingTense.vue'))
const CardMatching = defineAsyncComponent(() => import('~/components/CardMatching.vue'))
const GameResults = defineAsyncComponent(() => import('~/components/GameResults.vue'))

type Section = 'menu' | 'practice' | 'stats' | 'verbs' | 'synonyms' | 'antonyms' | 'cognates' | 'false-cognates'

const { mode, isFinished, selectedVerbs, resetGame, setupCustomVerbsGame } = useVerbGame()

const section = ref<Section>('menu')

const navLinks: { id: Section; label: string }[] = [
  { id: 'menu', label: 'Menú' },
  { id: 'practice', label: 'Practicar' },
  { id: 'synonyms', label: 'Sinónimos' },
  { id: 'antonyms', label: 'Antónimos' },
  { id: 'cognates', label: 'Cognados' },
  { id: 'false-cognates', label: 'Falsos Cognados' },
  { id: 'stats', label: 'Estadísticas' },
  { id: 'verbs', label: 'Verbos' },
]

// The pill row needs ~990px (brand + 8 pills); below that width it would force the
// whole page wider than the screen, which is what made every mobile screen shrink.
// `useNavPanel` is driven by a matchMedia so the template never has to know the width.
const navPanelId = 'section-nav-panel'
const isNavPanelOpen = ref(false)
const compactNavQuery = '(max-width: 1024px)'
const isCompactNav = ref(false)

function syncCompactNav(event: MediaQueryList | MediaQueryListEvent) {
  isCompactNav.value = event.matches
  // Leaving the compact breakpoint must not strand an open panel on desktop.
  if (!event.matches) isNavPanelOpen.value = false
}

function closeNavPanel() {
  isNavPanelOpen.value = false
}

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeNavPanel()
}

const mediaQuery = import.meta.client ? window.matchMedia(compactNavQuery) : null
if (mediaQuery) {
  syncCompactNav(mediaQuery)
  mediaQuery.addEventListener('change', syncCompactNav)
  window.addEventListener('keydown', onWindowKeydown)
}

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', syncCompactNav)
  if (import.meta.client) window.removeEventListener('keydown', onWindowKeydown)
})

const modeComponents: Record<GameMode, Component> = {
  'write-all': WriteAllTenses,
  'fill-missing': FillMissingTense,
  'card-matching': CardMatching,
}

const isSessionActive = computed(() => selectedVerbs.value.length > 0)

function goToSection(next: Section) {
  section.value = next
  closeNavPanel()
}

function goHome() {
  resetGame()
  section.value = 'menu'
  closeNavPanel()
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
            <span class="brand-name">The Best IFL Team</span>
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
            {{ link.label }}
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

          <button
            v-else
            type="button"
            class="nav-toggle"
            :class="{ open: isNavPanelOpen }"
            :aria-expanded="isNavPanelOpen"
            :aria-controls="navPanelId"
            aria-label="Secciones"
            @click="isNavPanelOpen = !isNavPanelOpen"
          >
            <span class="nav-toggle-bar" aria-hidden="true" />
            <span class="nav-toggle-bar" aria-hidden="true" />
            <span class="nav-toggle-bar" aria-hidden="true" />
          </button>
        </div>
      </div>

      <nav
        v-if="!isSessionActive && isNavPanelOpen"
        :id="navPanelId"
        class="nav-panel"
        aria-label="Secciones"
      >
        <button
          v-for="link in navLinks"
          :key="link.id"
          type="button"
          class="nav-panel-link"
          :class="{ active: section === link.id }"
          :aria-current="section === link.id ? 'page' : undefined"
          @click="goToSection(link.id)"
        >
          {{ link.label }}
        </button>
      </nav>
    </header>

    <main class="page-content">
      <template v-if="!isSessionActive">
        <MainMenu v-if="section === 'menu'" @navigate="goToSection" />
        <GameSetup v-else-if="section === 'practice'" />
        <SynonymsPractice v-else-if="section === 'synonyms'" />
        <AntonymsPractice v-else-if="section === 'antonyms'" />
        <CognatesPractice v-else-if="section === 'cognates'" />
        <FalseCognatesPractice v-else-if="section === 'false-cognates'" />
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
  min-width: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  /* `none`: the name is nowrap, so the brand must take its natural width
     instead of shrinking and letting the text spill past its box. */
  flex: none;
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
  flex: none;
}

.brand-name {
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
  white-space: nowrap;
}

.brand-tag {
  font-size: 0.675rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary-light);
  white-space: nowrap;
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

/* Compact header: brand + hamburger. The pill row needs ~990px, so it is the
   thing that disappears, never the section list itself. */
.nav-toggle {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 2.75rem;
  height: 2.75rem;
  padding: 0;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.nav-toggle:hover,
.nav-toggle:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--primary);
}

.nav-toggle-bar {
  display: block;
  width: 1.15rem;
  height: 2px;
  border-radius: var(--radius-full);
  background: var(--text-main);
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.nav-toggle.open .nav-toggle-bar:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.nav-toggle.open .nav-toggle-bar:nth-child(2) {
  opacity: 0;
}

.nav-toggle.open .nav-toggle-bar:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* Dropdown panel, anchored to the sticky header. */
.nav-panel {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 1.25rem 1rem;
  max-height: calc(100vh - 4.5rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  border-top: 1px solid var(--border-subtle);
  background: rgba(7, 9, 14, 0.97);
  animation: popIn 0.18s ease-out;
}

.nav-panel-link {
  display: flex;
  align-items: center;
  min-height: 2.75rem;
  padding: 0.6rem 0.85rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-main);
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.nav-panel-link:hover {
  background: rgba(255, 255, 255, 0.06);
}

.nav-panel-link.active {
  background: var(--primary-gradient);
  box-shadow: 0 4px 12px var(--primary-glow);
}

@media (max-width: 1024px) {
  .nav-links {
    display: none;
  }
  .nav-toggle {
    display: flex;
  }
}

/* The eight pills need ~990px; between the compact breakpoint and the full
   1040px content width they only fit with slightly tighter padding. */
@media (min-width: 1025px) and (max-width: 1120px) {
  .nav-links {
    gap: 0.15rem;
  }
  .nav-link {
    padding: 0.4rem 0.6rem;
    font-size: 0.78rem;
  }
}

@media (max-width: 720px) {
  .brand-tag {
    display: none;
  }
  .navbar-content {
    padding: 0.6rem 1rem;
  }
}

@media (max-width: 380px) {
  .brand-name {
    font-size: 1rem;
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

@media (max-width: 720px) {
  .nav-reset-btn {
    min-height: 2.75rem;
    padding: 0.5rem 0.9rem;
  }
}

.page-content {
  flex: 1;
}
</style>
