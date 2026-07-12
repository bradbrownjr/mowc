# Licensing: what MOWC may and may not contain

## The situation

Monster of the Week (MotW) is written by Michael Sands and published by
Evil Hat Productions. Despite the free playbook PDF downloads on
evilhat.com, **MotW is not open source and has no open game license**
(unlike Fate, which Evil Hat releases under CC-BY/OGL, or D&D's SRD).
The rules text, playbook text, move text, published mysteries, and monster
write-ups are copyrighted. "Monster of the Week" is also their trademark.

Evil Hat has historically been fan-friendly (see their fan-work and
licensing pages at evilhat.com), but fan policies permit non-commercial
fan works with attribution; they do not grant the right to redistribute
book text inside a software product.

## What this means for the codebase (enforced by AGENTS.md rule 1)

**May ship in this repo / Docker image:**
- The engine: schemas, sheet layouts, dice mechanics (game *mechanics* are
  not copyrightable; their *expression* is), sync, builders, theming
- Structural facts needed by the engine: rating names (Charm, Cool, Sharp,
  Tough, Weird), the 2d6 result bands, track sizes; these are unprotectable
  mechanics
- Invented placeholder content for tests and demos ("The Placeholder"
  playbook, "Test Monster"); make it obviously fake, never paraphrased
  from the books

**Must never ship:**
- Playbook text, move trigger/outcome text, improvement text, or any prose
  from the books or the free PDFs (free download does not mean free
  license)
- Published mysteries, monsters, or setting material
- Scans/embeds of the PDFs (`*.pdf` is gitignored on purpose)
- Anything presenting MOWC as official; the app must carry the
  "unofficial, not affiliated with Evil Hat" notice

**Users may do locally whatever their books allow:** typing playbooks
they own into a content pack for their own table is personal use. The
content-pack system exists exactly so that this happens on the user's
server, not in our distribution.

## If we ever want to bundle real content

The path is asking Evil Hat directly (they have a licensing contact page).
Until written permission exists, assume no.

## App code

MIT (see LICENSE). Keep third-party dependencies to permissive licenses
(MIT/Apache-2/BSD/ISC); flag anything GPL/AGPL before adding it.
