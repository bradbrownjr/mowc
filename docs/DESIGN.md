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
- **Tracks**: Luck/Harm/XP are rows of tappable square boxes (44px tap
  target; on the narrowest phones the visual box may flex down to 40px
  with the hit area padded back up, see Layout) with hand-drawn-weight
  2px borders; filled state is a solid ink block, the "unstable"
  threshold box gets a danger border. Boxes must stay clearly visible
  against `--bg` in both themes; an empty box is an outline, not a
  near-invisible fill.
- **Ruled sections**: notes areas show faint ruled lines (repeating
  linear-gradient), like notebook paper.
- **Dice banner**: a roll result slides in as a torn-slip banner: big
  display-font total, outcome band (10+/7-9/miss) as a stamp, then the
  outcome text. This is THE signature interaction; it gets the motion
  budget.
- **Conversion flags**: admin PDF-conversion notes (docs/adr/0001) render as
  a bordered callout, `--accent` border (never `--danger`; a flag means
  "verify this", not a failure), a flag icon, the message in body font, and
  any verbatim source excerpt in Courier at `--text-xs` inside its own
  scrollable block below the message.
- **Sync status**: a compact app-shell cluster (right of the top bar): a
  cloud/cloud-off icon for online/offline (`--ink-muted`, `--danger` when
  offline), an optional pending-changes count chip (`--surface-2` box,
  Courier), and a bordered "Sync now" icon button that flushes queued ops
  (disabled when offline or nothing is queued; its icon spins while syncing,
  opacity-only under `prefers-reduced-motion`). When a local write loses a
  merge, a **conflict toast** appears: a `--danger`-bordered card stacked
  bottom-right (clear of the mobile bottom bar and its safe-area inset), a
  warning icon, "Your edit to X was overridden by a newer change." in body
  font, and a dismiss button. Toasts are dismissible and deduped by the
  losing op id; never `{@html}`.

## Tokens (CSS custom properties, defined once in `client/src/lib/styles.css`)

Spacing and type scales are shared with sibling repos (tangible):
`--space-1..16` (4/8/12/16/24/32/48/64px), `--text-xs..2xl`
(12/14/16/18/20/24px), `--radius-sm/md/lg` (2/4/8px; deliberately squarer
than typical, this is paperwork), `--tap-min: 44px`.

Layout tokens (see the Layout section; land with 0.11.2):
`--page-narrow: 28rem`, `--page-content: 46rem`, `--page-wide: 74rem`,
`--rail-w: 13rem`, `--sheet-rail-w: 22rem`, `--bottombar-h: 56px`.

Surfaces and ink (each theme overrides these, components never hardcode):

```
--bg            page background (grain overlay lives here)
--surface       panel / folder
--surface-2     nested panel, table stripe
--ink           primary text
--ink-muted     captions, meta
--border        1-2px solid, visible; borders do structural work in this
                design, shadows are minimal
--accent        one per theme (amber #E8A33D dark / red-pencil #973A2D
                light; light accent darkened from the original #C24B3A
                in the 0.11.8 contrast audit, see Accessibility)
--danger        harm, death, failed rolls
--ok            success band
```

All of the above are text or UI-boundary colors that must clear WCAG AA
against every surface they render on (Accessibility section); exact hex
values live only in `client/src/lib/styles.css`, never repeated here or
hardcoded in components.

## User theming (Phase 8 contract)

The 0.11.7 account-menu control only picks which of the two shipped base
themes applies (or follows the OS), stored client-side (`localStorage`,
`client/src/lib/theme.svelte.ts`); it does not touch per-user token
overrides. Full user theming below is still Phase 8, not yet built.

End users may override: `--accent`, surface hue tint, border radius set,
border width (1px "fine" / 2px "marker"), and choose any shipped preset.
Theme = a JSON object of token overrides stored per user, applied to
`:root` at runtime, contrast-validated (4.5:1 minimum for ink-on-surface;
reject or auto-correct failing accents). Motifs and fonts are NOT
user-themable; they are the product's identity.

## Layout

Expanded 0.11.1 (Phase 11). This section is the binding spec for the
0.11.2 app shell; routes must not invent their own page-level layout.

### Breakpoints

Exactly three tiers, two cut points. Components use no other widths in
media queries. Mobile-first: base styles are the mobile layout, tiers
add on top.

| Tier | Range | Query |
|---|---|---|
| mobile | below 768px | base styles |
| tablet | 768 to 1023px | `@media (min-width: 768px)` |
| desktop | 1024px and up | `@media (min-width: 1024px)` |

### Page container

Every route's content renders inside the shared `.page` container,
defined once in `styles.css`. Routes never declare their own
page-level `max-width` (the pre-0.11 per-route rules are the bug this
exists to fix).

- Centered: `margin-inline: auto`; the page never hugs a screen edge.
- Gutters: `padding-inline: var(--space-4)` on mobile, `var(--space-6)`
  on tablet and up.
- Sections inside a page stack with `gap: var(--space-6)`.
- Width variants (tokens below):
  - `.page` (default, `--page-content`): wizards and forms, entity
    sheets on mobile/tablet, pack editor.
  - `.page--narrow` (`--page-narrow`): login, register, invite
    redemption. A lone form field never spans a wide page.
  - `.page--wide` (`--page-wide`): screens with a rail or multi-column
    grid: campaign screens (which carry the context rail), Keeper
    dashboard, packs list, character sheet on desktop.

### App shell

- Top bar (all tiers): brand link left. On tablet/desktop the
  folder-tab nav (File tabs motif) sits beside it: Characters,
  Campaigns, Content packs (order and the dropped "My" prefix landed
  0.14.1; the home dashboard below now owns the "yours" framing, so the
  tabs read as plain section names). Right side is a compact account
  menu: a button showing the display name (ellipsis past 12rem) that
  opens a small panel with a Theme group (Midnight Unit / Field Notes /
  Follow system, landed 0.11.7) above Log out. The bar is one line,
  always; nothing in it may wrap.
- Mobile bottom tab bar: fixed to the viewport bottom, replaces the
  folder tabs on mobile (the top bar keeps only brand + account).
  Each destination is an icon plus a Courier label at `--text-xs`; the
  tap target is the full bar height (`--bottombar-h`). Active tab: 2px
  accent top rule and accent-colored label. Destinations outside a
  campaign: Home, Characters, Campaigns, Packs, Account (five; order
  matches the top bar's Characters-before-Campaigns-before-Packs
  sequence, 0.14.1). Inside a campaign: Overview, Sheet (hunter) or
  Mysteries (Keeper), World, Campaigns (back out) (four; Account is
  dropped there since the top bar's account button stays reachable).
  The page container reserves bottom padding equal to `--bottombar-h`
  plus the safe-area inset so content never hides behind the bar.
- Campaign context rail (tablet/desktop, routes under
  `/campaigns/[id]`): left column, `--rail-w` wide, sticky below the
  top bar. Rows: Overview, Characters, Mysteries (Keeper), Reference
  (Keeper), World (monsters, minions, bystanders, locations grouped),
  Dashboard (Keeper), Settings (Keeper). Hunters see only rows they can
  use. Active row: accent left rule plus `--surface` background, the
  same "open folder" language as the tabs. The rail is navigation only;
  it never holds actions or stats. Reference, like Dashboard and
  Settings, is rail-only: it is not added to the mobile in-campaign
  bottom bar, which is already at its four-tab limit above.

### Screen patterns

- Character sheet, mobile/tablet: single column, order Ratings, Tracks,
  Moves, Gear, Notes; the ratings row is sticky under the top bar
  during play.
- Character sheet, desktop: two-column grid inside `.page--wide`: left
  column `--sheet-rail-w` (identity, ratings, tracks), sticky while the
  right column (moves, gear, notes) scrolls.
- Tracks never orphan-wrap. A track of up to 8 boxes fits on one row at
  a 390px viewport: the box flexes between 40px and 52px visual size,
  and when it renders below 44px the hit area is padded back to 44px
  (the Accessibility rule is not waived).
- Builders (characters, monsters, mysteries): numbered wizard steps
  with a progress rail (D&D Beyond's builder is the reference), each
  step one decision, review screen at the end that shows a compact
  preview of the thing being created. A disabled Next is always
  accompanied by a field note saying what is missing ("Pick 2 more
  moves").
- Keeper dashboard (desktop): two-pane, mystery list left, detail
  right; collapses to list, then detail navigation on mobile.
- Wide content (countdown tables, session log) scrolls inside its own
  `overflow-x: auto` container; the page never scrolls horizontally.
- Signed-in home (`/`, 0.14.1): three stacked sections inside the
  default `.page` container, each a list with the Empty states pattern
  for a zero-rows case: Characters (every character the user owns,
  flat, each row tagged with its campaign or "Standalone", a "View
  all" link to the full `/characters` roster), Campaigns I'm Running
  (campaigns where the user is Keeper), Campaigns I'm In (campaigns
  where the user holds a hunter seat). The signed-out landing (two
  role-path cards) is unchanged; only the signed-in branch became a
  dashboard instead of a two-link CTA row.

## Guidance copy ("field notes")

The helper-text pattern for forms, wizard steps, and section headers.
It reads like a note in the margin of the case file.

- One or two short sentences, body font, `--text-base` (16px floor
  applies; this is prose, not a meta label), italic, `--ink-muted`,
  placed directly under the heading or label it explains.
- Plain language for someone who has never played a monster-hunting
  tabletop game. Original wording only, never game text (AGENTS.md
  rule 1).
- Never restates its label. "Campaign name: the name of the campaign"
  is banned; say something the label cannot ("Players will see this
  when they join").
- Component: `FieldNote.svelte` (lands with 0.11.2; add its inventory
  row in that change).

### Sourced guidance (collapsible, pack content)

A variant for when the guidance text itself comes from an attached
content pack rather than app copy, and can therefore run long (a full
mystery-creation process with several steps and prompts, for example).
Unlike a `FieldNote`, this is collapsed by default:

- A native `<summary>`/`<details>` element, `<summary>` in original
  wording that says the guidance is sourced from the player's own
  content pack (e.g. "Mystery creation guide (from your content
  pack)"), never a game-text heading.
- Body content (headings, prompt lists) is the pack's own text,
  rendered as-is; this is allowed to be game text since it renders at
  runtime from user-supplied content, never bundled in the repo
  (AGENTS.md rule 1).
- Only rendered when the relevant pack field is present; an attached
  pack without that guidance renders nothing extra.
- First user: the mystery builder's Concept & Hook and Countdown steps
  (0.12.1), rendering each attached pack's `mysteryCreation.steps`.

## Empty states

A bare "No X yet." is banned. An empty state is a panel with a dashed
`--border` border containing, in order:

1. One sentence saying what the thing is, glossing jargon per the
   plain-language policy below.
2. One sentence saying when or why you would create one.
3. Exactly one CTA (link or button). Not two. If a hunter cannot
   create the thing (Keeper-only entity), there is no CTA; the second
   sentence instead says who will fill it in ("Your Keeper reveals
   locations here as you discover them").

Component: `EmptyState.svelte` (lands with 0.11.3; inventory row in
that change).

## Plain language (glossary policy)

The app must be usable by a player who joined five minutes ago and has
never heard the word Keeper.

- Screen titles and nav labels use the game's real terms (players
  should learn them); glosses teach the terms without replacing them.
- Every game term gets a parenthetical gloss on its first appearance
  per screen: "Keeper (the person running the game)", "hunter (a
  player's character)", "playbook (a character template)", "move (an
  action your character can roll dice for)", "mystery (one session's
  case)". Descriptions are our own wording, never quoted game text.
- Gloss strings live in one module, `client/src/lib/glossary.ts`
  (landed 0.11.6, exports `GLOSS`); screens import them, never retype
  them, so the wording stays consistent app-wide.

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
  code, not a checklist: `client/src/lib/contrast.test.ts` parses the live
  token hex values out of `styles.css` and asserts 4.5:1 (text tokens) or
  3:1 (`--border`, a UI boundary) against every surface, so a future token
  edit that regresses contrast fails `npm test` instead of only being
  caught by eye. User-theme (Phase 8) overrides still need their own
  runtime check when that feature lands, since those tokens aren't in
  `styles.css`.

## Enforcement

- No hardcoded colors/spacing/radii/fonts outside `styles.css` (tokens
  only). Add a `npm run check` grep for hex literals in `.svelte` files.
- New component variants require a row in the component inventory below.

## Component inventory

| Component | File | Notes |
|---|---|---|
| FieldNote | `client/src/lib/FieldNote.svelte` | The guidance-copy pattern (the "Guidance copy" section): a short helper note placed directly under a heading or label, body font at `--text-base`, italic, `--ink-muted`. Copy is passed as children so callers can include a glossary term inline. Landed with 0.11.2 (shell scaffold); first content user is the campaign Overview's brief role explainer under the "Keeper"/"Hunter" label (0.11.3, original wording, not a game-text quote); the full builder guidance pass (0.11.5) and onboarding sweep (0.11.6) followed, the latter also making every screen's first "Keeper" mention import its gloss from `client/src/lib/glossary.ts` rather than retyping it. |
| InstallButton | `client/src/lib/InstallButton.svelte` | Fixed bottom-right PWA install affordance; shown only when `beforeinstallprompt` fired. Tokens only (accent border, meta font). |
| StepIndicator | `client/src/lib/StepIndicator.svelte` | Numbered wizard progress rail for Builders (the "Layout" section's Builders line). Props: `steps: string[]`, `current: number`. Purely presentational; current step gets an accent border, completed (`done`) steps a filled `--surface-2` background, upcoming (`locked`) steps get muted `--ink-muted` text plus a small `Lock` icon (0.11.5, wizards are linear so a locked step isn't reachable by tapping ahead). First user: the character builder wizard (`campaigns/[id]/characters/new`); also used by the monster and mystery builders. |
| EvidenceTag | `client/src/lib/EvidenceTag.svelte` | The "evidence tag" motif: rectangular chip, one clipped corner (`--tag-clip`), Courier label. Props: `label: string`. First user: the character sheet's move/gear tags (`campaigns/[id]/characters/[characterId]`). The `packs/[id]` playbook move-rating tags migrated off their predating inline `.tag` style to this component in 0.11.7. |
| Stamp | `client/src/lib/Stamp.svelte` | The "Stamps" motif (Motifs section): a bordered uppercase status marker, rotated -2deg, `--accent` or `--danger` color at 80% opacity. Props: `label: string`, `tone?: "accent" \| "danger"` (default `"accent"`). Distinct from EvidenceTag: a stamp marks a state (REVEALED, UNSTABLE, SOLVED), a tag labels metadata. Landed 0.11.7 for the character sheet's Unstable marker (`tone="danger"`), the World list's per-entity Revealed marker, and "Solved" wherever a mystery's `resolved` status renders (mysteries list, Keeper dashboard list/detail, the hunter-facing mystery sheet). The Dice banner's roll-band stamp (`DiceBanner.svelte`) and the character sheet's roll-history band stamp predate this component and keep their own local styling since they carry banner-specific motion (400ms slide + stamp thunk) this component does not implement; not migrated. |
| DiceBanner | `client/src/lib/DiceBanner.svelte` | The "Dice banner" motif (Motifs section): a torn-slip card, fixed near the top of the viewport with a full-screen transparent tap-to-dismiss backdrop, showing the move name, a die/rating breakdown line, the total in oversized display type, the outcome band (10+/7-9/Miss) as a rotated stamp, then the matching outcome text. Props: `moveName: string`, `ratingLabel: string`, `result: RollResult`, `outcomeText: string \| null`, `onDismiss: () => void`. 400ms slide-in + stamp thunk (scale 1.1→1.0) per the Motion section; opacity-only fade under `prefers-reduced-motion`. Stamp/border color is `--accent` for a mixed result, `--ok` for full success, `--danger` for a miss. First user: the character sheet's move rollers (`campaigns/[id]/characters/[characterId]`). |
| Footer | `client/src/lib/Footer.svelte` | Rendered once in the root layout, below `{@render children()}`, on every route. Two centered `--font-meta` lines at `--text-xs`, `--ink-muted`, uppercase, letterspaced 0.08em (the same "field caption" treatment as `.meta`/`.nav-link` elsewhere), separated from page content by a `--border` top rule. Line 1 is the LICENSING.md-required "unofficial fan project, not affiliated with Evil Hat" notice; line 2 is copyright, MIT license, and the running app version pulled from `healthState` (`client/src/lib/health.svelte.ts`). |
| ConversionNote | `client/src/lib/pack-editor/ConversionNote.svelte` | Renders one `conversionNotes` string (`<fieldPath>: <message>`, optionally a blank line then a verbatim source excerpt; grammar is `formatConversionNote` in `shared/src/schemas/conversion.ts`) as the "Conversion flags" motif callout. Props: `note: string`. First user: the admin PDF-conversion review screen (`packs/convert`); also threaded optionally into `PlaybookEditor`/`MovesEditor` via a `notes` prop that defaults to none, so the plain `packs/new` flow is unaffected. |
| SyncStatus | `client/src/lib/SyncStatus.svelte` | The "Sync status" motif: the top-bar online/offline indicator + pending-changes count + "Sync now" button, and the dismissible conflict-toast stack. Reads the `syncStatus` runes store (`client/src/lib/sync-status.svelte.ts`); "Sync now" calls `syncNow()` (flushes every scope with queued ops through the existing `push` path, no new API); each toast's dismiss calls `dismissConflict(opId)`. Rendered once in the root layout inside the `.shell-right` cluster next to the account menu, only when signed in. Landed 0.7.4 (folded in with the 0.7.2 conflict-toast work; they share the store). |
| EmptyState | `client/src/lib/EmptyState.svelte` | The "Empty states" pattern: a dashed-border panel with what-it-is copy, why/when-to-create copy (or, via the `children` snippet, who fills it in when the viewer cannot create the entity themselves), and at most one CTA. Props: `what: string`, `why: string`, `ctaLabel?: string`, `ctaHref?: string`, optional `children` snippet overriding the why copy. Landed with 0.11.3; first users are the campaign hub's Characters/World/Mysteries list routes and the role-aware Overview. |
