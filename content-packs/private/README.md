# Private content packs (NOT FOR DISTRIBUTION)

This directory is gitignored except for this README. It holds Monster of
the Week game content transcribed from Evil Hat's freely downloadable PDFs
for **personal table use only**, pending permission from Evil Hat
(docs/LICENSING.md). Never commit these JSONs, never bake them into a
Docker image, never share them outside the group.

## Status

All packs below were accuracy-audited line-by-line against their source
extractions and validated against the shared `ContentPackSchema` on
2026-07-18 (see the audit summary at the bottom of this file). "Verbatim
gaps" (source prints no miss clause, generic miss text applied; unmappable
reference lists; modeling decisions) are recorded in each pack's own
`conversionNotes` array.

| File | Source | State |
|---|---|---|
| motw-basic-moves.mowcpack.json | Hunter Reference Sheets (revised) | complete, audited |
| motw-keeper.mowcpack.json | Keeper Reference Sheets (revised) | complete, audited |
| motw-playbook-the-chosen.mowcpack.json | Playbooks Consolidated 2025 | complete, audited, EXEMPLAR |
| motw-playbook-the-crooked.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-divine.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-expert.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-flake.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-initiate.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-monstrous.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-mundane.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-professional.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-spell-slinger.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-spooky.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-wronged.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-action-scientist.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-celebrity.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-changeling.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-covenant.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-curse-eater.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-envoy.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-forged.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-gumshoe.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-hex.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-host.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-interface.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-pararomantic.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-searcher.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-snoop.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-spooktacular.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| motw-playbook-the-visitor.mowcpack.json | Playbooks Consolidated 2025 | complete, audited |
| pdfs/ | downloaded PDFs + pdftotext extractions | source material |

All 12 core-rulebook playbooks plus all 16 expansion playbooks present in
the Hunter Playbooks Consolidated 2025 PDF are done. Pack ids run
sequentially `...0001` through `...001e`; the next new pack takes
`1a7c9d2e-001f-4000-8000-00000000001f`. Remaining work is the Team
playbooks (Teambooks), listed below.

## Converting a playbook (task spec for a Sonnet-class agent)

Goal: convert one `pdfs/slices/<name>.txt` file into
`motw-playbook-the-<name>.mowcpack.json`.

0. Regenerate the extracted text (the per-playbook slices are not kept
   around). From `pdfs/`, run:
   `pdftotext -layout hunter-playbooks-2025.pdf hunter-playbooks-2025.txt`
   Then find your playbook's line range with
   `grep -n "^The " hunter-playbooks-2025.txt` and read that range with
   the Read tool's offset/limit. (If the -layout extraction is too badly
   column-interleaved for a given playbook, re-extract just its pages with
   PyMuPDF block/column clustering, which yields clean per-column text.)
1. Read `motw-playbook-the-chosen.mowcpack.json` in full first. It is the
   exemplar; match its structure, key names, and conventions exactly.
   `the-expert` (haven), `the-crooked` (multi-section background/heat/
   underworld), and `the-monstrous` (breed with suggestions) are good
   secondary references for playbooks with rich `extras`.
2. Read your line range in full. The text was extracted from a 3-column
   PDF with `pdftotext -layout`, so columns interleave: a sentence may
   continue several lines down, past unrelated text from a neighboring
   column. Reconstruct each section completely before writing JSON. The
   `b` or `B` characters at line starts are checkbox glyphs, not words.
   The move-intro line ("You get all the basic moves, plus...") is often
   split from the playbook body; grep for "<Name> moves" to find it.
3. Every playbook has these sections; find them all: intro blurb, ratings
   lines (5 lines of Charm/Cool/Sharp/Tough/Weird), Luck (note any
   playbook special rule), Harm (max 7, unstable at 4 unless stated),
   looks (three lists), moves (note which are granted vs pick-N),
   gear/weapons (as `gearChoices`, keep harm ratings and tags verbatim
   in parentheses), playbook-specific extras (fate, haven, magic, etc. as
   `extras` composites), introductions, history list, improvements list,
   advanced improvements list, creation instructions.
4. Transcribe text VERBATIM from the slice (fix only hyphenation broken
   across lines and obvious extraction artifacts). Do not paraphrase, do
   not invent, do not fill gaps from memory. If a passage is garbled or
   ambiguous in the slice, add it to a `"conversionNotes"` array at the
   pack root instead of guessing.
5. IDs: kebab-case slugs. Pack id: increment the last hex digit sequence
   of the previous pack's uuid pattern (`1a7c9d2e-XXXX-4000-8000-...`).
6. Keep the same `license` string as the exemplar. This content is
   proprietary to Michael Sands / Evil Hat.
7. Validate: run `python3 -m json.tool <file>` and fix any parse error.
8. Do not modify any file outside this directory.

## Remaining work

**Core rulebook: DONE.** All 12 core playbooks (Chosen, Crooked, Divine,
Expert, Flake, Initiate, Monstrous, Mundane, Professional, Spell-Slinger,
Spooky, Wronged) plus basic moves and Keeper reference are complete.

**Expansion playbooks: DONE (2026-07-18).** All 16 hunter playbooks in the
Hunter Playbooks Consolidated 2025 PDF (Action Scientist, Celebrity,
Changeling, Covenant, Curse-eater, Envoy, Forged, Gumshoe, Hex, Host,
Interface, Pararomantic, Searcher, Snoop, Spooktacular, Visitor) are
converted and audited.

**Team playbooks / Teambooks (not started).** Source
`pdfs/team-playbooks-2025.txt`. These have a different structure than
hunter playbooks (team moves, roles, shared resources), so write a
`motw-teambook-*.mowcpack.json` exemplar first and add a `teambooks`
schema section to `docs/DATA-MODEL.md` before batch-converting.

**Other free PDFs (not started, may not map to packs).** The Tome of
Mysteries "Alternative Weird Moves and Phenomena" reference sheets and the
Codex rules-option handouts (Non-Lethal Play, Atonement Mysteries) have no
matching pack section in the current schema; revisit if a home for them
ever exists.

## Audit summary (2026-07-18)

Every pack was compared section-by-section against its source extraction
and validated against the shared `ContentPackSchema` (the Phase 2 schema
reconciliation the note below used to call for; all 30 packs pass).
Notable fixes: restored The Chosen's dropped protective-gear line; fixed
The Initiate's mistranscribed "Mentor" move (was invented "Ask the
Elders", missing its +Sharp rating); removed column-bleed text from The
Mundane's Always The Victim trigger; restored a dropped harm-rules
sentence and re-homed Big Magic's closing sentence in the basic moves
pack. The four Tome-draft packs (Gumshoe, Hex, Pararomantic, Searcher)
needed heavy repair: missing advancedImprovements lists in all four, a
missing Gumshoe move (Out of the Past), an invented Pararomantic blurb
(removed), a wrong Searcher weapon (".38 revolver" vs the printed "Small
handgun"), and schema drift throughout; they were also re-stamped
consolidated-2025 (they claimed ToM provenance) and re-id'd 000f-0012 to
clear collisions with core packs. Convention: moves whose printed text
omits a miss clause carry the generic miss consequence from the basic
moves pack's coreRules.roll; packs flag this in conversionNotes where it
applies.
