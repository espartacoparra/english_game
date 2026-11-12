# Mobile-first layout for The Best IFL Team

The app is designed at a 1040px desktop width and breaks on phones: the section nav is
535px wide, which widens the layout viewport to 658px on a 390px device, so every screen is
scaled down and clipped. This feature makes every screen usable at 390px (and 360px) with the
desktop rendering preserved. Non-goals: redesigning the visual identity, changing game rules,
or touching the room protocol.

## Specs

**S1 — The page must look good on mobile.**
> "quiero que hagamos que la pagina se vea bien en mobiles, porque actualmente se ve muy mal"
> Consequences: at a 390px viewport every screen has `document.documentElement.scrollWidth`
> equal to the 390px viewport (no horizontal overflow, no zoomed-out layout), and no visible
> text, button or control is clipped or overlapped.

**S2 — Mobile navigation is a hamburger menu.**
> Decision: "Menú hamburguesa"
> Consequences: below the desktop breakpoint the header shows the logo plus a `☰` button; the
> button opens a panel listing all eight sections (Menú, Practicar, Sinónimos, Antónimos,
> Cognados, Falsos Cognados, Estadísticas, Verbos); choosing a section closes the panel; the
> button exposes `aria-expanded` and `aria-controls`.

**S3 — Desktop rendering is unchanged, except the brand title no longer wraps.**
> Consequences: at 1025px and above the header keeps the pill row with all eight labels
> visible; every element below the header keeps its exact desktop x/width/height. The one
> intended change is the header height: `The Best IFL Team` used to wrap onto two lines even
> at 1280px (`.brand-text` was 71px tall), so the header shrinks from 100px to 72px.

**S4 — Every screen is in scope, including the multiplayer rooms.**
> Decision: "Todo, incluidas salas"
> Consequences: hub, practice setup, the three game modes, results, stats, verb library, the
> four vocabulary practices and `/room/[code]` are all verified at 390px.

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1, S2, S3 | inline | `feat(nav): hamburger menu on mobile` |
| T2 | S1, S4 | inline | `fix(layout): responsive hub, setup and game screens` |
| T3 | S1, S4 | inline | `fix(layout): responsive vocabulary, stats and library screens` |
| T4 | S1, S4 | inline | `fix(layout): responsive multiplayer room screens` |
| T5 | S1, S3, S4 | inline | verification only, no commit (see L6) |

## Log

**L1** — "quiero que hagamos que la pagina se vea bien en mobiles, porque actualmente se ve muy mal"

**L2** — Decision (navigation): "Menú hamburguesa"

**L3** — Decision (scope): "Todo, incluidas salas"

**L4** — Evidence (measured with Playwright at 390x844, mobile emulation): layout viewport is
658px instead of 390px; the only outermost offender is `nav.nav-links` at
`[124..658] w=535`. Fixing the nav is the prerequisite for measuring every other screen.

**L5** — Evidence (static audit): no `@media` block exists in `GameResults.vue`,
`SynonymsPractice.vue`, `AntonymsPractice.vue`, `CognatesPractice.vue`,
`FalseCognatesPractice.vue`, `RoomModeSelect.vue`, `RoomRoundChoice.vue`,
`RoomRoundList.vue`, `RoomRoundTenses.vue` or `pages/room/[code].vue`.

**L6** — Verification evidence (no committed browser test). Layout at a viewport is only
observable with a browser engine and `playwright` is not a project dependency, so adding a
viewport test would mean a new dev dependency the user did not ask for. Verification was run
instead as a Playwright audit script outside the repository:
- 14 screens (menu, nav panel, practice, 4 vocabulary practices, stats, library, 3 game modes,
  results, room lobby) at 320, 360 and 390px: `document.documentElement.scrollWidth` equals the
  viewport on every screen, and no interactive control is shorter than 32px.
- 4 room round screens (`write-all`, `fill-missing`, `card-matching`, `cognates`) with two real
  players against `wrangler dev`: no horizontal overflow at 390px.
- Desktop at 1280px compared against the base commit (`440b8d2`) in a second worktree: every
  element below `.app-navbar` has identical x/width/height on all 7 sections; only the header
  height differs (100 -> 72px, S3).
- `pnpm test` 164/164 passing; `pnpm build` succeeds.

**L7** — Defects found while verifying, each fixed at the cause:
- `nav.nav-links` (535px) forced a 658px layout viewport at 390px: every screen was scaled down.
- `<input>` keeps its intrinsic 20-character width even with `min-width: 0`, which widened the
  practice setup card to 392px at a 360px viewport; the fix is `width: 0` plus `flex: 1 1 auto`.
- `grid-template-columns: repeat(2, 1fr)` in `CardMatching` let a long label widen its column
  past the card border; the fix is `minmax(0, 1fr)`.
- `word-break: break-word` in `RoomRoundBoard` split `reportar/informar` mid-word; the fix is
  `overflow-wrap: break-word`.
- Mobile overrides placed before base rules were overridden by them (equal specificity, later
  wins); every mobile block now sits at the end of its component's style block.
