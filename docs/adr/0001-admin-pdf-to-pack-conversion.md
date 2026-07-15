# ADR 0001: Admin PDF-to-content-pack conversion contract

- Status: accepted
- Date: 2026-07-15
- Scope: ROADMAP 0.9.5. Defines the contract that 0.9.6 (parser engine)
  and 0.9.7 (convert UI) implement. No code lands with this ADR.

## Context

Admins (the `MOWC_ADMIN_EMAIL` server-owner account) transcribe game
books they own into content packs by hand today. A prior manual
conversion session showed the work is mechanical enough to automate but
error-prone at structure boundaries: a real bug misplaced gear-list text
into a move's trigger because a bullet did not end with a colon. The
schema already anticipates automation: `ContentPack.conversionNotes`
(`string[]`, optional) exists as the "flag, never guess" channel, and
`docs/DATA-MODEL.md` names PDF auto-conversion as its intended producer.

Constraints this design must satisfy:

1. **Licensing (AGENTS.md rule 1, docs/LICENSING.md).** Extracted game
   text may never enter the repo, test fixtures, or the Docker image.
   Conversion runs only at runtime against an admin-uploaded file, and
   output lives only in the instance database under `$MOWC_DATA_DIR`.
2. **Server simplicity (KISS).** The server has no multipart or file
   upload handling anywhere; zip expansion for pack import happens
   client-side. Whatever this feature adds server-side must stay small.
3. **Existing pack pipeline.** `POST /api/content-packs` already
   validates with `ContentPackSchema.strict()`, caps bodies at 5 MB,
   rejects dangerous keys, and gives admin uploads `visibility:
   'shared'`. Packs have no update endpoint (create, read, delete only).
4. **Backward compatibility.** `conversionNotes` is shipped in pack
   format v1 as an array of plain strings. Existing packs must keep
   validating.
5. **Offline-first exception.** AGENTS.md rule 2 allows Keeper/admin
   admin screens to be online-only. Conversion is squarely that: it is
   never needed during play.

## Decision

### 1. Endpoint: stateless, admin-only, raw PDF body

```
POST /api/admin/conversions
Content-Type: application/pdf        (raw bytes, not multipart)
```

- Mounted behind `requireAuth`; the handler then checks
  `isAdmin(req.user, adminEmail)` (`server/src/authz/admin.ts`) and
  returns 403 for everyone else. When `MOWC_ADMIN_EMAIL` is unset,
  nobody passes the check, so the endpoint is effectively disabled.
- Body parsing via `express.raw({ type: "application/pdf", limit:
  "25mb" })` scoped to this path only, mirroring how the 5 MB pack
  limit is scoped to `/api/content-packs`. No multer, no multipart, no
  file fields: one request is one PDF.
- The endpoint is **stateless**. The server never writes the PDF to
  disk and never persists drafts. Bytes are piped to the extractor on
  stdin and the result is returned in the response body. There is no
  new table, no draft status column, no cleanup job.

Status codes:

| Code | Meaning |
|---|---|
| 200 | Conversion ran; body is a `ConversionResult` (drafts may be imperfect, that is what `conversionNotes` is for) |
| 400 | Body is not a PDF (magic-bytes check: must start with `%PDF-`) or is empty |
| 403 | Authenticated but not the admin account |
| 413 | Body over 25 MB |
| 422 | Extraction failed: pdftotext exited nonzero, timed out, or produced no usable text |
| 429 | Rate limited, or a conversion is already in flight |

### 2. Extraction: poppler `pdftotext -layout`, fully sandboxed

- The Docker image adds `poppler-utils` to the runtime stage (Debian
  package, available on both linux/amd64 and linux/arm64).
- Invocation is `pdftotext -layout - -` via `child_process.spawn` with
  a fixed argv array (never a shell string): PDF bytes on stdin, text
  on stdout. No user-influenced value ever becomes an argument or a
  path, and no temp file is created.
- Resource caps, enforced in the Node wrapper: 30 s wall-clock timeout
  (process killed on breach), 4 MB cap on captured stdout (process
  killed on breach), at most one conversion in flight per server
  process (a second concurrent request gets 429).
- Rate limit: a strict bucket of 10 conversions/hour per user, the same
  granularity as the existing content-pack upload bucket
  (docs/SECURITY.md section 4). Every conversion attempt is logged with
  user id and outcome, like other admin-relevant actions.

Rejected alternative, client-side extraction (pdfjs-dist in the
browser, POST the text): it would keep the server file-free like the
zip import does, but pdfjs text extraction does not preserve column
layout, and the two-column playbook sheets are exactly where boundary
detection lives or dies. poppler's `-layout` output is the format the
prior manual conversion validated. The server-side cost is one
well-sandboxed subprocess on an admin-only, online-only path.

Rejected alternative, multipart upload (multer): adds a dependency and
a parser surface for no benefit; the request has exactly one part.

### 3. One PDF becomes many draft packs

Response body (new zod schema in `shared/`, exported like
`ContentPackSchema`):

```
CONVERSION_RESULT_FORMAT = "mowc-conversion-result/v1"

ConversionResult {
  $format: "mowc-conversion-result/v1"
  drafts: ContentPack[]     // each independently valid against
                            // ContentPackSchema, fresh uuid, $format set
  notes: string[]           // document-level flags (same grammar as
                            // conversionNotes, see section 4), e.g. text
                            // the splitter could not attribute to any
                            // draft, attached verbatim
}
```

Split rule for a consolidated PDF:

- Each detected playbook becomes **its own draft pack** (one playbook
  in `playbooks`), named after the playbook.
- All non-playbook reference material found (basic moves, core rules,
  hunter/Keeper agendas, Keeper moves, mystery creation, guidance
  text) is gathered into **one additional "reference" draft pack**,
  named `<PDF title> reference`.
- Text the splitter cannot confidently attribute to any draft goes
  into top-level `notes` with the raw text attached. Never silently
  dropped, never guessed into a field.

Why many small drafts instead of one big pack: the admin reviews,
fixes, saves, or discards each draft independently, so one bad
boundary detection quarantines to one draft instead of blocking the
whole book, and a re-run for a single failed playbook does not disturb
drafts already saved. It also matches how packs are attached to
campaigns (per-playbook granularity is useful there).

Draft field defaults (each backed by a conversionNote when the parser
had to invent a value):

- `id`: fresh uuid per draft, so saving can never 409 against an
  existing pack.
- `name`: playbook name, or `<PDF title> reference`.
- `author`: PDF metadata Author when present, else the admin's display
  name, plus a note to verify.
- `version`: `"0.1.0"` plus a note.
- `license`: a verbatim copyright/license line when one is detected in
  the PDF, else unset plus a pack-level note telling the admin to
  record source and terms (docs/LICENSING.md).

### 4. `conversionNotes` grammar (no schema change)

`conversionNotes` stays `z.array(z.string().max(5000))`. Shipped v1
packs keep validating. The contract is a string convention, not a new
shape:

```
<fieldPath>: <message>

<verbatim source excerpt>
```

- `fieldPath` is a JSON path from the pack root, e.g.
  `playbooks[0].moves[3].trigger`. Pack-level notes use the literal
  path `pack`. Document-level notes in `ConversionResult.notes` use
  the literal path `document`.
- The first blank line separates the message from an optional verbatim
  source excerpt (the raw extracted text the parser was unsure about).
  The excerpt is truncated to keep the whole note within 5000 chars.
- The review UI (0.9.7) parses the leading path best-effort with
  `^[A-Za-z$_][\w$]*(\[\d+\])?(\.[A-Za-z$_][\w$]*(\[\d+\])?)*:` and
  surfaces the note inline next to the field it references. Any note
  that does not match renders in a general "conversion notes" section
  instead of being hidden. Hand-written notes in existing packs are
  therefore still displayed, just not field-anchored.

Rejected alternative, structured note objects (`{path, message,
source}`): cleaner to parse, but it either breaks pack format v1 or
forks the field into a union, and every consumer (editor, review UI,
export) would carry both branches forever. The prefix convention costs
one regex and keeps the format stable.

### 5. Saving drafts reuses the existing pack pipeline

- The review screen (0.9.7) holds `ConversionResult` in client memory
  only. The admin edits each draft in the pack editor (0.2.4), then
  saves it via the existing `POST /api/content-packs`, one request per
  draft. Admin uploads automatically become `visibility: 'shared'`;
  nothing about pack storage, authz, or attachment changes.
- Every saved draft passes the same `ContentPackSchema.strict()`
  validation, 5 MB cap, and dangerous-key rejection as any other pack.
  The conversion endpoint's output being schema-valid is a parser
  requirement, not a validation bypass.
- Unsaved drafts are lost on navigation. Accepted: re-running a
  conversion is cheap and idempotent from the admin's point of view,
  and holding server-side draft state would add exactly the
  persistence machinery this design avoids. Drafts are never written
  to IndexedDB and never synced (admin-only, online-only surface).
- There is still no pack update endpoint. Fixing a saved pack means
  delete and re-save, unchanged from today. If in-place pack editing
  ever lands, conversion inherits it for free because drafts are just
  packs.

### 6. Licensing guardrails for implementation and tests

- Extraction runs only at runtime against a file the admin supplies.
  Output exists only as API responses and, once saved, rows in the
  instance database under `$MOWC_DATA_DIR`. Nothing extracted is ever
  committed, bundled, or baked into an image.
- Parser tests (0.9.6) must use PDFs with invented placeholder content
  ("The Placeholder" playbook style), either generated at test time or
  committed as tiny fixtures whose text is entirely made up. CI never
  downloads or embeds a real book.
- The Dockerfile change is `poppler-utils` only; no content of any
  kind ships with the tool.

## Consequences

- New server surface: one admin-only route, one subprocess wrapper, one
  scoped raw-body parser, one shared schema. docs/SECURITY.md sections
  1, 3, 4, and 7 apply as written; the caps above (25 MB body, 30 s
  timeout, 4 MB output, 10/hour, single-flight) are the section 4 and
  7 entries for this endpoint and must land with 0.9.6.
- The Docker image grows by roughly the size of poppler-utils and its
  libs (tens of MB). Accepted for a self-hosted single image.
- The parser (0.9.6) has a hard contract: every draft it emits is
  schema-valid, every invented default is flagged, uncertain text is
  flagged with source attached, unattributable text surfaces in
  `notes`. "Flag, never guess" is testable: no input may produce a
  draft containing text the parser placed without either confidence or
  a note.
- The review UI (0.9.7) needs no new server calls beyond the two that
  exist after 0.9.6: convert, then save-per-draft.
