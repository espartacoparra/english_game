# Multiplayer rooms for VerbMaster

Two-player real-time play on Cloudflare Workers, inside the free tier, starting with the
`write-all` race mode. Single-player behavior and the `localStorage` stats stay unchanged.
Non-goals: accounts, ranked matchmaking, more than two players per room, paid Cloudflare features.

## Specs

**S1 — Real-time two-player play on the Cloudflare free tier.**
> "quiero que evaluemos los diguiente: de que forma podriamos hacer que varios de los juegos se puedan jugar con amigo en tiempo real, claro tenemos que tener en cosideracion que estamos usando los cloudflare workers y bueno que podemos gastarnos tanto la parte gratuita, porque no tengo para pagar"

**S2 — Deployment keeps happening on Cloudflare.**
> "vamos a segir desplegando encloudflare"

**S3 — All game modes, starting with the first one (race).**
> "me gustaria que metieras todos esos modos, empecemos cocn el primero ?"

**S4 — Peer-to-peer was evaluated; the MVP uses Durable Object + WebSocket, and the game logic sits behind a transport interface so P2P can be added later.**
> "existe la posibilidad de abrir una conexion per to per entre navegadores? para no consumir cuota de cloudflare ?"
> Decision: "Durable Object + WebSocket (recomendado)"

**S5 — SST is removed; deploys go through Wrangler.**
> Decision: "Sacar SST, deploy con Wrangler"

**S6 — A room takes two to eight players, not two.**
> "permitir que se puedan unir varios hasta 8 jugadores"
> Consequences: `room_full` fires above 8, a game starts with 2..8, the lobby shows every slot,
> and card-matching turn order is round-robin over the joined players.

**S7 — Modes without an objective answer become objective; card-matching becomes turn-based.**
> Decision: "Convertir a quiz multiple-choice" for `cognates` and `false-cognates`.
> Decision: "Tablero compartido por turnos" for `card-matching`.
> The practice screens stay single-player and self-reported; only the room grades them.

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S2, S5 | inline | feat(deploy): drop SST, pin Wrangler and add deploy scripts (`a96302b`) |
| T2 | S1 | inline | refactor(state): move game and stats state out of module singletons |
| T3 | S1, S3 | worker | feat(game): extract a pure game reducer with tests (`be0849a`) |
| T4 | S1 | inline | feat(multiplayer): race mode over WebSocket transport (`dcc24e6`) |
| T5 | S1 | worker | feat(room): Durable Object room with authoritative protocol (`451943b`) |
| T6 | S1, S3 | inline | feat(multiplayer): race mode over WebSocket transport (`dcc24e6`) |
| T7 | S3, S6 | worker | feat(multiplayer): fill-missing race (`modes/tenses.ts`) |
| T8 | S3, S6, S7 | worker | feat(multiplayer): card-matching turn-based board (`modes/board.ts`, `RoomRoundBoard.vue`) |
| T9 | S1, S3, S6 | worker | feat(room): mode registry and eight-player rooms (`machine.ts`, `modes/spec.ts`) |
| T10 | S3, S7 | worker | feat(multiplayer): synonyms and antonyms with partial credit (`modes/words.ts`) |
| T11 | S3, S7 | worker | feat(multiplayer): cognates and false-cognates as quiz duels (`modes/quiz.ts`) |
| T12 | S3, S6 | worker | feat(room): mode-driven client dispatcher and lobby (`[code].vue`, `room/`) |
| T13 | S3, S6 | worker | feat(room): multi-mode smoke coverage (`scripts/room-smoke.mjs`) |
| T14 | S3, S7 | worker | refactor(data): move practice item pools into `app/data/practice.ts` |
| T15 | S1, S6 | worker | feat(room): round deadline on a Durable Object alarm (`expireRound`) |
| T16 | S1, S6 | worker | fix(room): all-answered waits only for active responders (`activePlayers`) |

## Slices

- Slice 1 — deploy pipeline (T1): `a96302b`.
- Slice 2 — SSR-safe state (T2): `be6b71f`.
- Slice 3 — pure game core + tests (T3): `be0849a`.
- Slice 4 — room server and client (T4-T6): `451943b` (server), `dcc24e6` (client).
- Slice 5 — fill-missing and card-matching (T7-T8): pending.

## Log

**L1 — 2026-11-09 — original request.** "quiero que evaluemos los diguiente: de que forma podriamos hacer que varios de los juegos se puedan jugar con amigo en tiempo real, claro tenemos que tener en cosideracion que estamos usando los cloudflare workers y bueno que podemos gastarnos tanto la parte gratuita, porque no tengo para pagar"

**L2 — 2026-11-09 — deploy stays on Cloudflare; P2P question.** "vamos a segir desplegando encloudflare, existe la posibilidad de abrir una conexion per to per entre navegadores? para no consumir cuota de cloudflare ?"

**L3 — 2026-11-09 — scope.** "me gustaria que metieras todos esos modos, empecemos cocn el primero ?"

**L4 — 2026-11-09 — branch was stale.** "revisa de nuevo que proyecto que no habia actualizado la rama". Re-mapped on `8660f0e`: 7 modes, 267 verbs, `localStorage` stats, `cloudflare_module` preset, dead SST/AWS config.

**L5 — 2026-11-09 — architecture decisions.** "Durable Object + WebSocket (recomendado)" and "Sacar SST, deploy con Wrangler".

**L6 — 2026-11-09 — evidence.** SST config is dead but still points at AWS. `wrangler` is not a dependency and there is no deploy script. Nitro's generated Wrangler config carries no Durable Object bindings, so rooms need their own Worker or a custom config. `ssr: true` plus module-level refs leaks state across requests. Free plan gives 10 ms CPU per invocation, so SSR has to be measured.

**L7 — 2026-11-09 — room worker evidence.** `workers/room` bundles clean (43.79 KiB / 9.06 KiB gzip) with the `ROOMS` Durable Object binding and the v1 SQLite migration. 30 pure machine tests added; suite at 58. The tests exposed one real defect: `joinRoom` checked `room_full` before `game_in_progress`, but a started room always has two players, so the `game_in_progress` error was unreachable and its Spanish message was wrong. Guards swapped. The Durable Object adapter (`room.ts`: sockets, hibernation, persistence, broadcast) has no automated test yet; it gets verified with two real clients in T6.

**L8 — 2026-11-09 — client slice evidence.** `dcc24e6` adds the pure protocol module, the `useRoom` adapter, `/room/[code]`, the menu entry and `smoke:room`. The smoke script drives the real Worker through `wrangler dev` with two Node WebSocket clients: two joins, third rejected with `room_full`, a round opens with a hint that has no answers, one wrong answer keeps it open, the second closes it with `winnerId: null`, and both clients get the same `finished` 0-0. Suite stays at 58. Known limits: a closed tab keeps its player slot (a reconnect with the same `playerId` resumes, a different browser cannot take the slot), and a mid-round reload does not replay the round's earlier progress. `pnpm dev` fails locally in `@nuxt/cli` (`options.hostname.toLowerCase`), pre-existing and unrelated; SSR was verified through the built output.

**L9 — 2026-11-09 — commit ownership.** El usuario hace los commits. A partir de acá los agentes dejan los cambios en el working tree y no commitean. Los 6 commits de esta feature (`a96302b`, `be6b71f`, `be0849a`, `451943b`, `dcc24e6`, `98401e4`) quedan a su criterio.

**L10 — 2026-11-09 — regression found in the browser.** `TypeError: pool.filter is not a function` on the practice screen. Cause: T3 re-exported the core `filterVerbs(pool, type, level)` from `useVerbGame`, changing the public signature that `GameSetup.vue:62` still called as `filterVerbs(type, level)`. The key-level API diff did not catch arity changes, and the tests only covered the core, not the composable adapter. Fixed with a two-argument wrapper in `useVerbGame`. Also added `dev:room` so the room Worker can run next to `pnpm dev`. Lesson: when re-exporting extracted functions, keep the adapter signature and test it, not just the core.

**L11 — 2026-11-09 — local dev setup.** `pnpm dev` also needed `devServer.host: 'localhost'` because `@nuxt/schema` 4.6.4 returns a `{ $resolve }` object for the default host that `@nuxt/cli` 4.0.1 passes to `hostname.toLowerCase()`; a stale `node_modules/.cache/nuxt/dev-server.json` with `"hostname":{}` made it worse. Local multiplayer now needs two processes: `pnpm dev:room` and `pnpm dev`.

**L12 — 2026-11-09 — scope grew to eight players and all seven modes.** "quiero que continuemos con lo que estabamos que era agregar el multipayer al todos los juegos" and "permitir que se puedan unir varios hasta 8 jugadores". Decisions: `cognates`/`false-cognates` become objective multiple-choice quizzes inside the room; `card-matching` becomes a shared board with alternating turns. Evidence from the mode map: the protocol already carries an inert `mode` field; `RoundHint` hides all answers on purpose; the reply is tense-shaped end to end; `GameMode` had three members while four practice modes lived as home sections with their data arrays inside the components. `app/core/room-protocol.ts` freezes the four round families (`tenses`, `choice`, `list`, `board`) so the worker and the client can move in parallel.

**L13 — 2026-11-09 — commits stay with the user.** No agent commits. Changes land in the working tree on `feat/multiplayer-rooms`.

**L14 — 2026-11-09 — stall defect found while adding the list modes.** `machine.ts:277` closes an `all-answered` round on `answersSoFar.length >= state.players.length`, and `leaveRoom` keeps a player's slot once the game started, so a departed player keeps the room waiting forever. With eight players that is not a corner case. Split into two fixes: T16 makes `all-answered` wait only for the responders the round is actually waiting on (a new `activePlayers` hook on `ModeSpec`, already derivable from the roster `words.ts` keeps), and T15 adds a deadline driven by a Durable Object alarm, because `setTimeout` does not survive hibernation in Workers.

**L15 — 2026-11-09 — evidence for T7-T16.** Suite 152 tests in 4 files (game-core 28, room-machine 70, room-words 30, room-quiz 24). `pnpm smoke:room` drives the real Worker through `wrangler dev` on a free port with real sockets: the full lifecycle, an eight-player roster (ninth join `room_full`, non-host start `not_host`, lone host `below_min_players`, host handover on a lobby leave), and the seven-mode matrix asserting prompt family, exact contract key sets, no answer leak, and a closed round with `outcomes` and `solution`; the board is played to completion with out-of-turn picks refused as `not_your_turn`. `pnpm build` completes the client including the four round components.

**L16 — 2026-11-09 — what the worker tests cannot see.** The smoke cannot answer `tenses` or `list` correctly because the pools are server-private; it asserts the prompt shape, the leak, a wrong reply earning 0, and that the public prompt agrees with the revealed solution instead. Board play is brute force (up to 400 picks) rather than knowledge. `tsc` never ran: `typescript` is not a dependency of this repo, so type-correctness is unproven and the substitute proof is the vitest suite, `vue/compiler-sfc` compilation of every SFC, the esbuild bundle of the Worker and a full `nuxt build`. A per-family deadline exists but the client renders no countdown, and `result` carries no `reason`, so a player cannot tell a timeout from a wrong-answer close.

