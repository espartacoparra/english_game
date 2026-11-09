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

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S2, S5 | inline | feat(deploy): drop SST, pin Wrangler and add deploy scripts (`a96302b`) |
| T2 | S1 | inline | refactor(state): move game and stats state out of module singletons |
| T3 | S1, S3 | worker | feat(game): extract a pure game reducer with tests (`be0849a`) |
| T4 | S1 | inline | feat(multiplayer): race mode over WebSocket transport (`dcc24e6`) |
| T5 | S1 | worker | feat(room): Durable Object room with authoritative protocol (`451943b`) |
| T6 | S1, S3 | inline | feat(multiplayer): race mode over WebSocket transport (`dcc24e6`) |
| T7 | S3 | inline | feat(multiplayer): fill-missing race |
| T8 | S3 | inline | feat(multiplayer): card-matching turn-based board |

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
