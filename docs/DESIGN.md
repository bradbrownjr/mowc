# MOWC Design Contract

Read this before any UI work (AGENTS.md rule 3). If a pattern is not in
this document, it is not in the product; extend the doc in the same change.

## Concept: "The Case File"

MOWC looks like the tools hunters would actually keep: a field notebook and
a case file, not a SaaS dashboard. Every screen should feel like evidence
being assembled. This is the identity that keeps the app from looking
machine-generated; protect it.

Two base themes, both shipped, user-switchable:

- **Midnight Unit (default, dark)**: near-black blue-charcoal surfaces,
  like a stakeout at 2 AM. Single hot accent (signal amber) used sparingly
  for the current action. Faint film-grain overlay on page background.
- **Field Notes (light)**: warm paper white with subtle grain, ink-dark
  text, manila-folder tinted panels, red-pencil accent.

Never: pure black `#000`, pure white `#fff` surfaces, purple-gradient
hero panels, glassmorphism blur cards, or emoji as UI.

## Typography (self-hosted via @fontsource; the PWA is offline, no CDN fonts)

| Role | Font | Usage |
|---|---|---|
| Display / numerals | Big Shoulders (condensed) | Screen titles, rating values, dice results. Uppercase, tight tracking. |
| Body | Alegreya Sans | All reading text. Humanist, bookish, nothing like default AI sans. |
| Label / meta | Courier Prime | Evidence-tag labels, field captions, timestamps, move tags. Uppercase, letterspaced 0.08em. |

Rules: exactly these three families. Body text never below 16px. Display
font never used for paragraphs.

## Motifs (use these instead of generic cards)

- **File tabs**: top-level navigation on desktop renders as folder tabs;
  the active section is the "open folder".
- **Evidence tags**: chips (move tags, gear tags, monster powers) are
  rectangular with one clipped corner and a Courier label, like a string
  tag. `--tag-clip: 8px`.
- **Stamps**: status markers (REVEALED, UNSTABLE, DEAD, SOLVED) render as
  bordered uppercase stamps, slightly rotated (-2deg), in the accent or
  danger color at 80% opacity.
- **Tracks**: Luck/Harm/XP are rows of tappable square boxes (44px min)
  with hand-drawn-weight 2px borders; filled state is a solid ink block,
  the "unstable" threshold box gets a danger border.
- **Ruled sections**: notes areas show faint ruled lines (repeating
  linear-gradient), like notebook paper.
- **Dice banner**: a roll result slides in as a torn-slip banner: big
  display-font total, outcome band (10+/7-9/miss) as a stamp, then the
  outcome text. This is THE signature interaction; it gets the motion
  budget.

## Tokens (CSS custom properties, defined once in `client/src/lib/styles.css`)

Spacing and type scales are shared with sibling repos (tangible):
`--space-1..16` (4/8/12/16/24/32/48/64px), `--text-xs..2xl`
(12/14/16/18/20/24px), `--radius-sm/md/lg` (2/4/8px; deliberately squarer
than typical, this is paperwork), `--tap-min: 44px`.

Surfaces and ink (each theme overrides these, components never hardcode):

```
--bg            page background (grain overlay lives here)
--surface       panel / folder
--surface-2     nested panel, table stripe
--ink           primary text
--ink-muted     captions, meta
--border        1-2px solid, visible; borders do structural work in this
                design, shadows are minimal
--accent        one per theme (amber #E8A33D dark / red-pencil #C24B3A light)
--danger        harm, death, failed rolls
--ok            success band
```

## User theming (Phase 8 contract)

End users may override: `--accent`, surface hue tint, border radius set,
border width (1px "fine" / 2px "marker"), and choose any shipped preset.
Theme = a JSON object of token overrides stored per user, applied to
`:root` at runtime, contrast-validated (4.5:1 minimum for ink-on-surface;
reject or auto-correct failing accents). Motifs and fonts are NOT
user-themable; they are the product's identity.

## Layout

- Mobile-first. Primary nav: bottom tab bar (Sheet, Party, Mysteries,
  Log, Settings) on <768px; folder-tab top nav plus a left context rail
  on desktop, like D&D Beyond's sheet vs. Roll20's table split.
- Character sheet (mobile): single column, order Ratings → Tracks → Moves
  → Gear → Notes; ratings row is sticky under the header during play.
- Builders (characters, monsters, mysteries): numbered wizard steps with a
  progress rail (D&D Beyond's builder is the reference), each step one
  decision, review screen at the end.
- Keeper dashboard (desktop): two-pane, mystery list left, detail right;
  collapses to list→detail navigation on mobile.
- Wide content (countdown tables, session log) scrolls inside its own
  `overflow-x: auto` container; the page never scrolls horizontally.

## Motion

- Budget: page transitions 150ms fade/slide, track boxes fill with a 120ms
  ink-blot scale, dice banner 400ms slide + stamp thunk (scale 1.1→1.0).
  Nothing else animates continuously.
- Honor `prefers-reduced-motion`: swap all of the above for opacity-only.

## Iconography

- Single source: `<Icon name="...">` component wrapping Lucide SVGs.
  Never bare `<svg>` in route files, never Unicode glyphs (▲ ✕ ✓) as icons.
- Icons are line-weight 2px to match the border language.

## Accessibility

- Tap targets ≥ 44px; visible focus ring (2px accent offset 2px).
- All track states (harm etc.) must be conveyed by fill + label, not color
  alone.
- Both themes and all user themes pass WCAG AA contrast; validation is
  code, not a checklist.

## Enforcement

- No hardcoded colors/spacing/radii/fonts outside `styles.css` (tokens
  only). Add a `npm run check` grep for hex literals in `.svelte` files.
- New component variants require a row in the component inventory below.

## Component inventory

| Component | File | Notes |
|---|---|---|
| InstallButton | `client/src/lib/InstallButton.svelte` | Fixed bottom-right PWA install affordance; shown only when `beforeinstallprompt` fired. Tokens only (accent border, meta font). |
| StepIndicator | `client/src/lib/StepIndicator.svelte` | Numbered wizard progress rail for Builders (the "Layout" section's Builders line). Props: `steps: string[]`, `current: number`. Purely presentational; current step gets an accent border, completed steps a filled `--surface-2` background. First user: the character builder wizard (`campaigns/[id]/characters/new`). |
