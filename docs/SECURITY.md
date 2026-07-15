# MOWC Security Policy

Baseline adapted from the ECTLogger project's security policy, expanded for
MOWC's stack (Express 5, better-sqlite3, session cookies, SSE, offline
sync). This document is the contract; the ROADMAP security gates below say
when each control must exist. Any new endpoint or entity must be checked
against this document as part of Definition of Done.

## Threat model

MOWC is a self-hosted app holding low-sensitivity data (game campaigns)
plus real credentials (email + password hashes). The assets worth
protecting, in order:

1. User credentials and sessions (reused passwords are the real risk)
2. Campaign data integrity (a hostile player must not read Keeper secrets
   or edit others' characters)
3. The host machine (uploads and sync input must not become RCE or
   resource exhaustion)

Assumed deployment: behind a reverse proxy terminating TLS, or on a LAN.
The app must still be safe if exposed directly.

## 1. Input validation

- **Every** API input is parsed with the shared zod schema before any
  logic runs (`schema.parse`, strict mode: unknown keys rejected). No
  handler reads `req.body` fields directly.
- All strings carry explicit `.max()` lengths. Defaults: names 100,
  descriptions/notes 5000, move/outcome text 2000, chat/log entries 5000.
- IDs validated as UUIDs; enum fields validated against the enum, never
  free text.
- JSON body size limit 1 MB globally; content-pack upload route allows
  5 MB, parsed with a depth/size guard before zod (a 5 MB pack of nested
  arrays must fail fast, not recurse).
- **Prototype pollution**: reject any JSON containing `__proto__`,
  `constructor.prototype`, or `Symbol` keys at the parse boundary; never
  deep-merge user JSON into existing objects (assign whole payloads).
- **XSS**: Svelte escapes by default. `{@html}` is banned in this codebase
  (add a `npm run check` grep). User content renders as text; markdown, if
  ever added, goes through a sanitizer with an allowlist.
- **SQL injection**: better-sqlite3 prepared statements with bound
  parameters only. String-built SQL is banned; the only allowed dynamic
  SQL is column lists from hardcoded constants.
- **Path traversal**: the server never derives filesystem paths from user
  input. Uploads are stored under generated UUID names in
  `$MOWC_DATA_DIR/uploads/`.

## 2. Authentication

- Passwords hashed with **Argon2id** (argon2 package defaults), never
  logged, minimum length 8, maximum 128 (no composition rules; encourage
  passphrases in the UI).
- Sessions: httpOnly, SameSite=Lax, Secure (when behind TLS) cookie
  holding a random 256-bit token; tokens stored hashed (SHA-256) in the
  DB with expiry. Logout deletes the row (real revocation, avoiding
  ECTLogger's known JWT-revocation limitation).
- Session lifetime 30 days rolling; reauthentication required for
  password change and account deletion.
- **CSRF**: state-changing routes verify the `Origin` header matches the
  configured origin; requests with no Origin are allowed (CLI/tests
  pattern from tangible). SameSite=Lax is the second layer.
- **SSE auth**: the events stream authenticates via the session cookie
  (same-origin), never via query-string tokens (ECTLogger's known
  WebSocket limitation, avoided by design).
- Invite codes: short-lived (72 h default), single-campaign, random
  128-bit, rate-limited on redemption, revocable by the Keeper.

## 3. Authorization

- One server-side module (Phase 3.4) answers every "can user U see/edit
  entity E" question. Routes never inline role checks.
- Rules: Keeper of a campaign sees and edits everything in it. A hunter
  edits only their own character(s), reads revealed entities plus party
  members' public sheet data. No cross-campaign access, ever; every
  entity query is scoped by `campaign_id` AND membership (prevents IDOR
  by guessing UUIDs).
- The **sync pull** path applies the same visibility filter as REST reads
  (SYNC.md invariant 4), and the **sync push** path applies the same
  edit rules per op. Sync is not a side door.

## 4. Rate limiting & resource exhaustion

- Global: 300 requests/min per IP (express-rate-limit).
- Strict buckets: login and register 10/min per IP, invite redemption
  10/min, content-pack upload 10/hour per user, sync push 60/min per
  user with max 500 ops per batch.
- SSE: max 5 concurrent streams per user; heartbeat every 30 s; dead
  connections reaped.
- Log every 429 and failed login with IP (structured log line) so
  fail2ban can consume it; ship an optional fail2ban filter/jail in
  `deploy/fail2ban/` like ECTLogger does.

## 5. HTTP security headers

Set globally (helmet or hand-rolled middleware, one module):

- `Content-Security-Policy`: split across two delivery mechanisms, since
  SvelteKit's own hydration bootstrap (and the theme-detection snippet in
  app.html) are unavoidably inline and adapter-static has no per-request
  server to hand out a nonce. The HTTP header (securityHeaders.ts) sets
  only `frame-ancestors 'none'` (the one directive a `<meta>` tag cannot
  express). `default-src 'self'`, `script-src` with a build-time sha256
  hash per page, `img-src 'self' data:`, and `connect-src 'self'` come
  from a `<meta http-equiv="Content-Security-Policy">` tag that SvelteKit
  generates per prerendered page (`client/svelte.config.js`'s `kit.csp`,
  mode `"auto"`). A header-level `default-src`/`script-src` here would win
  the browser's intersection of both policies and block the hash the meta
  tag allows, so do not add one.
  `style-src` is `'self' 'unsafe-inline'`, deliberately looser than
  `script-src`: SvelteKit's static wrapper markup (`app.html`'s
  `<div style="display: contents">`) and Svelte 5's own compiled
  hydration-boundary template use the identical `style="display:
  contents"` pattern, one statically in the served HTML and one applied
  at runtime by Svelte's client bundle. Both are `style-src-attr`
  violations under a strict policy, confirmed by running the built app
  in a real browser and listening for `securitypolicyviolation` events
  (`vite dev` never applies the header, which is why this wasn't caught
  earlier). Neither hashes nor nonces apply to `style` attributes without
  `'unsafe-hashes'`, and the runtime-generated instance has no fixed,
  hashable value across builds, so `'unsafe-inline'` is the only stable
  fix. `script-src` remains hash-only with no `'unsafe-inline'`; CSS
  injection cannot execute arbitrary script, only alter presentation or
  attempt narrow CSS-based exfiltration via attribute selectors, an
  accepted residual risk for a self-hosted, no-third-party-content app.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`,
  `Strict-Transport-Security` when TLS is detected,
  `Permissions-Policy` disabling camera/mic/geolocation.
- CORS: same-origin only. No `Access-Control-Allow-Origin` wildcard; the
  PWA is served by the same server that hosts the API.

## 6. Data protection & database

- SQLite file lives in `$MOWC_DATA_DIR` (mounted volume), WAL mode,
  `foreign_keys=ON`.
- Secrets (`MOWC_SESSION_SECRET`) come from env or are generated once and
  persisted with `0600` permissions in the data dir; never committed,
  never logged.
- Backups: document `sqlite3 .backup` + volume snapshot in the admin
  guide; the campaign export (Phase 9.1) is the user-level backup.
- Account deletion removes the user, their seats, sessions, and orphaned
  campaigns (GDPR-style, matching tangible's `DELETE /auth/me`).
- No analytics, no telemetry, no third-party calls at runtime. The PWA
  must function with zero external requests (also a CSP consequence).

## 7. Content-pack upload hardening

Packs are the only user-supplied file type. Treat them as hostile:

- Size cap (5 MB), JSON parse with depth limit, zod strict validation,
  reject unknown keys.
- All pack strings are rendered as text only (no HTML/markdown), so a
  malicious pack cannot script other users' browsers.
- Packs are private to their owner and the campaigns a Keeper explicitly
  attaches them to, with one exception: packs uploaded by the server-owner
  account (`MOWC_ADMIN_EMAIL`, `server/src/authz/admin.ts`) are `visibility:
  'shared'` and readable/attachable by every authenticated user on this
  instance, so a group doesn't each need their own copy of the same
  official-content pack. This is still one self-hosted instance, i.e. "the
  user's own table" per docs/LICENSING.md, not the cross-instance/public
  sharing gallery that bullet always meant to rule out; that still needs a
  dedicated security and licensing review before it happens. Only the
  designated admin account can create, edit, or delete a shared pack
  (enforced by ownership on write, same as any other pack); every other
  account's uploads default to private, unchanged from before.
- The planned admin PDF-to-pack conversion endpoint (Phase 9) is governed
  by docs/adr/0001-admin-pdf-to-pack-conversion.md: admin-only, stateless,
  25 MB raw-PDF body, sandboxed pdftotext subprocess with timeout/output/
  concurrency caps, 10 conversions/hour. Its caps must land with 0.9.6.

## 8. Container & deployment hardening

- Image runs as non-root (PUID/PGID), tini as PID 1, no shell needed at
  runtime beyond entrypoint.
- Read-only root filesystem compatible: only `$MOWC_DATA_DIR` is written.
- `HEALTHCHECK` hits `/healthz` on loopback (keep loopback allowed, see
  tangible gotcha).
- Compose examples publish only port 7120 and mount only the data volume.
- Reverse-proxy TLS example (nginx/caddy) documented in the admin guide;
  `trust proxy` configured so rate limiting sees real client IPs when
  `X-Forwarded-For` is present, and ignores it when not behind a proxy.

## 9. Dependencies & CI

- `npm audit` runs in CI (soft-fail initially, hard-fail on high/critical
  once the tree is stable, mirroring tangible's plan).
- Dependencies must be permissively licensed (docs/LICENSING.md) and
  pinned by lockfile; renovate/dependabot optional later.
- No postinstall scripts from new dependencies without review.

## 10. Security testing

- Unit tests for: authz module (every role x action matrix), zod boundary
  rejections (oversize, wrong types, unknown keys, proto-pollution keys),
  invite expiry, session revocation, sync visibility filtering.
- Playwright e2e (Phase 10): hunter cannot fetch unrevealed entities via
  REST or sync even with hand-crafted requests.
- Phase 10.3 is a full security review ([Fable]) against this document,
  OWASP Top 10, and the checklist below, before 1.0.

## Production checklist (admin guide will embed this)

- [ ] TLS in front (reverse proxy) or LAN-only exposure
- [ ] `MOWC_SESSION_SECRET` set (or verified generated with 0600 perms)
- [ ] Data volume mounted and verified (DB file appears under it)
- [ ] Backups scheduled (volume snapshot or `.backup`)
- [ ] Rate limiting left enabled (never disable in prod)
- [ ] Optional: fail2ban jail installed from `deploy/fail2ban/`
- [ ] Image updated regularly (`docker compose pull && up -d`)

## Vulnerability reporting

Do not open a public GitHub issue. Email the maintainer (repo owner)
with description, reproduction steps, impact, and suggested fix. Fixes to
credential or authz bugs get a release regardless of the roadmap phase.

## ROADMAP security gates

| Phase | Must land with it |
|---|---|
| 1 | Security headers module, body size limits, healthz on loopback |
| 2 | Pack upload hardening (section 7), strict zod at every boundary |
| 3 | Argon2id, hashed session tokens, CSRF origin check, rate-limit buckets, authz module + tests |
| 6 | SSE auth via cookie, per-user stream caps |
| 7 | Sync visibility filter tests, op batch caps, idempotency table pruning |
| 9 | Conversion endpoint caps per docs/adr/0001 (with 0.9.6) |
| 10 | Full review vs this doc; npm audit hard-fail on high/critical |
