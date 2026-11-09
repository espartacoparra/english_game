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
| T3 | S1, S3 | worker | feat(game): extract a pure game reducer with tests |
| T4 | S1 | inline | feat(router): add /room/[code] route |
| T5 | S1 | worker | feat(room): Durable Object room with authoritative protocol |
| T6 | S1, S3 | inline | feat(multiplayer): race mode over WebSocket transport |
| T7 | S3 | inline | feat(multiplayer): fill-missing race |
| T8 | S3 | inline | feat(multiplayer): card-matching turn-based board |

## Log

**L1 — 2026-11-09 — original request.** "quiero que evaluemos los diguiente: de que forma podriamos hacer que varios de los juegos se puedan jugar con amigo en tiempo real, claro tenemos que tener en cosideracion que estamos usando los cloudflare workers y bueno que podemos gastarnos tanto la parte gratuita, porque no tengo para pagar"

**L2 — 2026-11-09 — deploy stays on Cloudflare; P2P question.** "vamos a segir desplegando encloudflare, existe la posibilidad de abrir una conexion per to per entre navegadores? para no consumir cuota de cloudflare ?"

**L3 — 2026-11-09 — scope.** "me gustaria que metieras todos esos modos, empecemos cocn el primero ?"

**L4 — 2026-11-09 — branch was stale.** "revisa de nuevo que proyecto que no habia actualizado la rama". Re-mapped on `8660f0e`: 7 modes, 267 verbs, `localStorage` stats, `cloudflare_module` preset, dead SST/AWS config.

**L5 — 2026-11-09 — architecture decisions.** "Durable Object + WebSocket (recomendado)" and "Sacar SST, deploy con Wrangler".

**L6 — 2026-11-09 — evidence.** SST config is dead but still points at AWS. `wrangler` is not a dependency and there is no deploy script. Nitro's generated Wrangler config carries no Durable Object bindings, so rooms need their own Worker or a custom config. `ssr: true` plus module-level refs leaks state across requests. Free plan gives 10 ms CPU per invocation, so SSR has to be measured.
