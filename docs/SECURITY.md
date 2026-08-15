# Rushd — Security

Consolidated from the audit in commit `157fb78` plus what's added since
(screenshot import). Re-run this checklist after any new mutation or
upload path is added.

## Authentication

bcrypt (cost 12) password hashing, `jose`-signed JWT in an httpOnly,
`secure` (production), `sameSite=lax` cookie. Rate-limited signup/login
(in-memory, single-instance — see `docs/ARCHITECTURE.md` for the scaling
caveat). Session identity is read from the cookie in `src/lib/auth/dal.ts`
and is the *only* trusted source of "who is making this request" — never a
client-supplied field.

## Authorization / ownership

Every mutation across classes, assignments, exams, settings, and feedback
derives the acting user from `requireUserOrThrow()`, then scopes the
database operation to `(id, userId)` — `updateMany`/`deleteMany` return
zero affected rows for data you don't own, rather than a separate
forbidden-vs-not-found signal that could leak existence. Verified with
dedicated integration tests (`src/server/actions/ownership.integration.test.ts`).

Any client-supplied foreign key (e.g. `classId` on an assignment) is
re-verified server-side against the authenticated user's own records
(`assertOwnsClass`) before use — this holds even when the value originated
from an AI suggestion (quick-add, screenshot import), which is exactly the
case where you'd otherwise be tempted to skip it.

Admin (`requireAdmin()`) checks both authentication and `isAdmin` at the
data-access layer, not just by hiding a nav link. `isAdmin` is never
settable through any form or API — promotion is a direct database
operation only (documented in `README.md`).

## Input validation

Every server action validates input through Zod before touching the
database (`src/lib/validation/*.ts`). AI-produced structured output goes
through the identical schema as its deterministic-fallback counterpart —
see `docs/AI_ARCHITECTURE.md`.

## File uploads (screenshot import)

- MIME type allowlist enforced server-side (`image/png`, `image/jpeg`,
  `image/webp`) — the client-reported `Content-Type` and file extension are
  both untrusted; validation reads the actual file signature bytes, not
  the extension.
- 8MB per-file cap, 5 files per request cap, enforced before any bytes are
  sent to the AI provider.
- Never written to disk or object storage — see `docs/AI_ARCHITECTURE.md`
  and `docs/PRIVACY.md`. This eliminates an entire class of file-storage
  vulnerabilities (path traversal, stored-file XSS via serving user
  content, orphaned file cleanup) by not having persistent storage at all.

## Error handling

No server action ever forwards a caught exception's raw message to the
client — every returned error is a hand-written, safe string. Unhandled
exceptions fall through to Next.js's default production behavior, which
redacts stack traces and internal details automatically.

## CSRF

Handled by Next.js's built-in Server Actions Origin check (compares
request `Origin` to `Host`) — no manual CSRF token needed for any mutation
in this app, since every mutation is a Server Action.

## Secrets

`.env` is gitignored and was never committed (verified against full git
history, not just current status). `.env.example` contains no real values.
`ANTHROPIC_API_KEY` (when set) lives only in server-side env, never sent
to the client, never logged.

## Known gaps / next

- Per-user AI rate limiting (see `docs/AI_ARCHITECTURE.md`) — not yet
  needed at current usage, add before wider release.
- Rate limiter is in-memory, single-instance only — needs a shared store
  before horizontal scaling.
- No audit log of admin actions (there currently are none beyond viewing
  data, so nothing to log yet — add when admin gets write actions).
