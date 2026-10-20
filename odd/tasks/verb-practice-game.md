# Verb Practice Game

## Objective
Build an interactive English verb practice game inside the existing Nuxt 3 project so users can choose how many verbs to practice per session and play through three distinct mechanics.

## Problem
The repository is a fresh Nuxt 3 starter with no pages, components, or game logic. We need a complete client-side verb-practice feature including data, types, game state, UI components, and scoring.

## Why
User requested an English verb trainer with multiple mini-games and per-session verb count selection.

## Scope
- In scope:
  - Seed data: at least 20 common irregular verbs with Spanish translation, base form, simple past, and past participle.
  - Type definitions for verbs and game state.
  - Composable for game setup, verb selection, answer validation, and score tracking.
  - Home page with game setup: choose verb count (5, 10, 15, 20 or all) and game mode.
  - Three game modes:
    1. **Write all tenses** — show Spanish verb, user types base / past / participle; validate on "Next"; green when correct, red when wrong; show correct answer below on error.
    2. **Fill missing tense** — show one random tense filled in, user types the other two; validate and feedback same as mode 1.
    3. **Card matching** — shuffle cards with Spanish and the three English tenses; user clicks cards to group them by verb; validate group when four cards are selected.
  - Results summary at the end of each session.
- Out of scope:
  - Backend persistence or user accounts.
  - Audio, leaderboards, or spaced repetition.
  - Responsive Tailwind theming (use scoped CSS for now).

## Constraints
- Keep dependencies unchanged (only Vue/Nuxt already installed).
- No server-side code needed; all data lives in `app/data/verbs.ts`.
- Use Nuxt 3 app directory and auto-imports.
- Spanish UI copy is acceptable because the user wrote in Spanish and the game content mixes Spanish prompts with English answers; code identifiers and comments remain in English.

## Acceptance Criteria
- [ ] `app/data/verbs.ts` exports a typed array of at least 20 irregular verbs.
- [ ] `app/types/verb.ts` defines `Verb`, `TenseKey`, and game mode types.
- [ ] `app/composables/useVerbGame.ts` exposes setup, current question, answer handling, scoring, and reset.
- [ ] `app/pages/index.vue` renders the setup screen.
- [ ] `app/components/GameSetup.vue` lets the user pick verb count and mode.
- [ ] `app/components/WriteAllTenses.vue` implements mode 1 with green/red feedback and correct answer display.
- [ ] `app/components/FillMissingTense.vue` implements mode 2.
- [ ] `app/components/CardMatching.vue` implements mode 3.
- [ ] `app/components/GameResults.vue` shows score and a replay button.
- [ ] `app/app.vue` uses `<NuxtPage />`.
- [ ] `pnpm dev` starts without errors and the game is playable.

## Tasks
1. [x] Create verb data and types — `app/data/verbs.ts`, `app/types/verb.ts`.
2. [x] Create `useVerbGame` composable — `app/composables/useVerbGame.ts`.
3. [x] Create setup and mode components — `GameSetup`, `WriteAllTenses`, `FillMissingTense`, `CardMatching`, `GameResults`.
4. [x] Wire pages and app.vue — `app/pages/index.vue`, `app/app.vue`.
5. [x] Verify dev server and basic playthrough.

## Delivery Strategy
`single-pr` — the feature is self-contained and fits in one branch.

## Forecast
~350 authored changed lines (additions + deletions), within the 400-line heuristic.
Actual: ~760 authored changed lines across data, types, composable, 5 components, page, and app.vue update.

## Verification
- `pnpm install` — already up to date.
- `pnpm nuxt prepare` — types generated successfully.
- `pnpm nuxt build` — production build completed successfully (6.76s) and includes chunks for all five components.
- `pnpm dev` — server starts on `http://localhost:3010/`.
- Headless Chrome end-to-end tests (CDP) against the live app:
  - Setup screen renders.
  - Write-all: 3 inputs render, wrong answers show red + correct forms, correct answers show 3 green inputs, full 5-verb session reaches "5 de 5 correctos", replay returns to setup.
  - Fill-missing: given tense is pre-filled and disabled, wrong answers show corrections, correct answers show 3 green inputs, full 5-verb session reaches "5 de 5 correctos".
  - Card-matching: 20 cards render, all 5 groups match, results show "Intentos totales: 5" and "Grupos encontrados: 5 de 5", replay returns to setup.
  - Browser console: zero exceptions and zero console errors in all flows.

## Notes
- Card matching should reshuffle cards for the selected verbs on every new game.
- Answer comparison should be case-insensitive and trim whitespace.
- Mode 2 should rotate which tense is pre-filled per verb.
- Card matching internally renders `GameResults` on completion because it tracks its own `attempts` counter; write/fill modes rely on `index.vue` switching to `GameResults` when `isFinished` is true.
- **Fixed integration bug**: `index.vue` originally resolved mode components through string names in `:is`, which Nuxt's auto-import scanner does not detect, so the mechanics never mounted. It now imports all five components explicitly and maps `GameMode -> Component`.
- Removed an invalid TypeScript assertion from the `WriteAllTenses` template by defining `tenseOrder` in the script.

## Work units
- Foundation: `app/data/verbs.ts`, `app/types/verb.ts`, `app/composables/useVerbGame.ts`, `app/app.vue`.
- UI batch A: `app/pages/index.vue`, `app/components/GameSetup.vue`.
- UI batch B: `app/components/WriteAllTenses.vue`, `app/components/FillMissingTense.vue`.
- UI batch C: `app/components/CardMatching.vue`, `app/components/GameResults.vue`.
