# Practice Hub and Mastery Stats

## Objective
Turn the single setup screen into a main menu with clear sections — practice, statistics, and verb library — and add persistent per-verb mastery tracking so the learner can see their hits and which verbs they command or do not.

## Problem
Today `app/pages/index.vue` renders `GameSetup` directly, so the only screen is the practice configuration. There is no way to inspect long-term progress: `useMistakes.ts` (uncommitted WIP) only decrements an error counter and is never surfaced in the UI. `WriteAllTenses.vue` exposes a "Ver respuesta" hint button that reveals the full answer and skips the exercise.

## Why
The user asked to remove the answer-reveal button, add main-menu practice sections, show hit statistics, and list mastered versus unmastered verbs.

## Scope
- In scope:
  - Remove the "Ver respuesta" hint from `WriteAllTenses.vue` (button, handler, and its styles).
  - New `useStats` composable: persisted per-verb counters (`attempts`, `correct`, `incorrect`, `streak`, `bestStreak`, `lastSeenAt`) in `localStorage` under `verbmaster_stats_v1`.
  - Mastery rule: a verb is mastered when it reaches 3 consecutive correct answers (`streak >= 3`); any failure resets the streak.
  - Record answers from `useVerbGame.recordResult` and `CardMatching`, replacing the duplicate `useMistakes` bookkeeping.
  - Delete `app/composables/useMistakes.ts` (superseded by `useStats`).
  - `MainMenu.vue`: hero plus three section cards (Practicar, Estadísticas, Verbos) with a live accuracy summary.
  - `StatsPanel.vue`: summary cards (aciertos, fallos, precisión, verbos dominados), mastery progress bar, and the two lists — verbs usted handles and verbs not yet handled.
  - `VerbLibrary.vue`: searchable/filterable list of all verbs with per-verb status and counters.
  - `index.vue`: section routing (`menu` | `practice` | `stats` | `verbs`), navbar section links, and game view as an override while a session is active.
- Out of scope:
  - Backend persistence, accounts, sync, or spaced repetition scheduling.
  - Changes to verb seed data or to the three game mechanics.
  - New dependencies.

## Constraints
- Keep the existing dark design system from `app/assets/css/main.css`; scoped CSS only.
- No new runtime dependencies; Vue/Nuxt only.
- SPA mode (`ssr: false`): guard every `localStorage` access with `typeof window`.
- UI copy stays Spanish; identifiers, comments, and commit messages stay English.

## Acceptance Criteria
- [x] `WriteAllTenses.vue` has no "Ver respuesta" button and no `giveUpHint` handler.
- [x] `useStats` persists per-verb counters and survives a reload; `clearStats` resets them.
- [x] Mastery is derived from `streak >= 3` and is shared by every view.
- [x] `index.vue` shows a main menu with Practicar / Estadísticas / Verbos sections and a way back to it.
- [x] Statistics show hits, misses, accuracy, mastered count, and both verb lists.
- [x] Verb library filters by status and searches by English or Spanish form.
- [x] `useMistakes.ts` is gone and no component references it.
- [x] `pnpm nuxt build` succeeds with no Vue/Nuxt compile errors.

## Tasks
1. [x] Extend `app/types/verb.ts` with `VerbStat`, `StatsSnapshot`, and mastery status types.
2. [x] Create `app/composables/useStats.ts` with persistence, recording, and derived lists.
3. [x] Wire recording in `useVerbGame.ts` and `CardMatching.vue`; delete `useMistakes.ts`.
4. [x] Remove the answer-reveal hint from `WriteAllTenses.vue`.
5. [x] Create `MainMenu.vue`, `StatsPanel.vue`, and `VerbLibrary.vue`.
6. [x] Rewire `index.vue` with section routing and navbar navigation.
7. [x] Verify with production build and a browser smoke run.

## Delivery Strategy
`single-pr` — self-contained UI/state change inside one app directory.

## Forecast
~700-900 authored changed lines (additions + deletions), dominated by new components and scoped CSS. Above the 400-line heuristic; acceptable because the slices touch the same screens and splitting would leave the menu half-wired.

## Verification
- No test runner exists in the repository (no test script, no Vitest/Playwright dependency), so test-first cannot produce a meaningful RED. Proportionate structural and functional verification instead:
  - `pnpm exec nuxi prepare` + `pnpm exec nuxi build` — exit 0, Nitro `aws-lambda` bundle complete, warning-free log, finished in ~8s (independently re-run after the last edit).
  - Reference hygiene — `grep -rn "useMistakes|MistakeRecord|giveUpHint|Ver respuesta" app/` returns nothing; `app/composables/useMistakes.ts` absent.
  - Headless Chrome (CDP) against `pnpm dev`, 35/35 checks passed: main-menu sections and summary strip; fresh zero state; practice setup without the answer-reveal button; wrong answer persisted as `incorrect: 1` with `streak: 0` after advancing; menu and stats panel read-back; mastery seeded at `streak: 3` appears under "Verbos que manejas" with 75% accuracy while a failing verb appears under "Verbos que no manejas"; "Repasar mis fallos" starts a 1-verb session; verb library search and Todos/Dominados/Por dominar/Sin practicar/Con fallos filters; two-step reset clears storage only on confirmation; zero console errors.
- Not verified: TypeScript type-checking (no `vue-tsc`/`tsc` in the repo) and the built `.output` lambda bundle at runtime (smoke run used the dev server).

## Notes
- Answer recording happens when the player advances past a validated question (`recordResult`), matching the pre-existing game flow; abandoning a question before advancing does not count it.
- `Con fallos` in the verb library excludes mastered verbs: a mastered verb keeps its historical misses but no longer needs review, matching `problemVerbs` in `useStats`.
- The previous WIP decremented `errorCount` on success; a decrementing counter loses history. Per-verb correct/incorrect totals plus a consecutive streak give both a mastery signal and honest statistics.
- Card matching records one answer per successfully matched verb and one per wrong pick, which keeps stats comparable with the write/fill modes.
- Statistics are device-local. A future sync feature can migrate `verbmaster_stats_v1` without changing consumers.
