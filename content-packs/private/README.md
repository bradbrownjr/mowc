# Private content packs (NOT FOR DISTRIBUTION)

This directory is gitignored except for this README. It holds Monster of
the Week game content transcribed from Evil Hat's freely downloadable PDFs
for **personal table use only**, pending permission from Evil Hat
(docs/LICENSING.md). Never commit these JSONs, never bake them into a
Docker image, never share them outside the group.

## Status

| File | Source | State |
|---|---|---|
| motw-basic-moves.mowcpack.json | Hunter Reference Sheets (revised) | complete |
| motw-keeper.mowcpack.json | Keeper Reference Sheets (revised) | complete |
| motw-playbook-the-chosen.mowcpack.json | Playbooks Consolidated 2025 | complete, EXEMPLAR |
| motw-playbook-the-crooked.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-divine.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-expert.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-flake.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-initiate.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-monstrous.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-mundane.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-professional.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-spell-slinger.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-spooky.mowcpack.json | Playbooks Consolidated 2025 | complete |
| motw-playbook-the-wronged.mowcpack.json | Playbooks Consolidated 2025 | complete |
| pdfs/ | downloaded PDFs + pdftotext extractions | source material |

The 12 core-rulebook playbooks are done. Remaining work is the ~17
Codex/Tome expansion playbooks and the Team playbooks (Teambooks), listed
below.

## Converting a playbook (task spec for a Sonnet-class agent)

Goal: convert one `pdfs/slices/<name>.txt` file into
`motw-playbook-the-<name>.mowcpack.json`.

0. Regenerate the extracted text (the per-playbook slices are not kept
   around). From `pdfs/`, run:
   `pdftotext -layout hunter-playbooks-2025.pdf hunter-playbooks-2025.txt`
   Then find your playbook's line range with
   `grep -n "^The " hunter-playbooks-2025.txt` and read that range with
   the Read tool's offset/limit. (Expansion playbooks live in the Codex
   and Tome PDFs, not yet downloaded; see docs/LICENSING.md for the source
   list and download them the same way the core set was fetched.)
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

**Expansion playbooks (not started).** These come from the Codex of Worlds
and Tome of Mysteries PDFs (see docs/LICENSING.md for URLs; download them
into `pdfs/` first). The Hunter Playbooks Consolidated 2025 PDF also
contains many of these already, at these line ranges (from the
`grep -n "^The "` index): Action Scientist, Celebrity, Changeling,
Covenant, Curse-Eater, Envoy, Forged, Gumshoe, Hex, Host, Interface,
Pararomantic (its "gifts" list is a separate block just before it),
Searcher, Snoop, Spooktacular, Visitor.

**Team playbooks / Teambooks (not started).** Source
`pdfs/team-playbooks-2025.txt`. These have a different structure than
hunter playbooks (team moves, roles, shared resources), so write a
`motw-teambook-*.mowcpack.json` exemplar first and add a `teambooks`
schema section to `docs/DATA-MODEL.md` before batch-converting.

When schemas land in Phase 2, revisit these files: the hand-written
structure here is the design input for the zod `PlaybookDef` schema, and
once that schema exists, validate every pack against it and reconcile any
drift (update the exemplar, then the rest).
