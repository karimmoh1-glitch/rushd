# Rushd — Security

What is true today, with file references, what was fixed in the October 2026
hardening pass, and what is still open. Re-read the checklist at the end
whenever a new server action, route handler, upload path or table is added.

**Plainly:** Rushd has had an internal code review and automated tests, not
an independent penetration test. It is not SOC 2 certified. Its privacy
practices have not been reviewed by counsel against COPPA, FERPA or state
student-privacy laws, and there are no signed data processing agreements
with schools. Don't tell a school otherwise.

## Threat model

**What we protect.** Students' accounts; their academic data (courses,
assignments, exams, study history, mastery evidence, tutor conversations,
draft text, practice results); the Canvas/Teams credentials they connect
(they unlock the student's school accounts); our AI budget and the
Stripe account; the admin console.

**Who we defend against.**
- Another student (or anyone with an account) trying to read or change
  someone else's data: IDOR, missing ownership checks, guessable ids.
- An anonymous attacker on the internet: credential stuffing, account
  enumeration, password-reset abuse, scripted signups, spam into public
  forms, SSRF through the Canvas/calendar addresses we fetch, cost attacks
  on AI endpoints, hostile uploads.
- A malicious web page the student visits: CSRF, clickjacking, cross-site
  downloads, reverse tabnabbing.
- A stolen or borrowed session (shared school computer): limited by
  re-checking passwords for sensitive changes, session revocation, limits.
- Our own logs and analytics leaking content or secrets.

**Out of scope today** (not defended, or only partly): a compromised
Vercel/Neon/GitHub account or developer laptop; a malicious Canvas
instance a student points Rushd at *for themselves*; denial of service at
volume (we rely on Vercel's edge); a student's own device being compromised.

## Controls in place

### Authentication and sessions
- Passwords: bcrypt cost 12 (`src/lib/auth/password.ts`); policy in
  `src/lib/validation/auth.ts`.
- Session: HS256 JWT signed with `SESSION_SECRET` in an `httpOnly`,
  `SameSite=Lax`, `Secure` (production) cookie, 30 days
  (`src/lib/auth/session.ts`). Identity comes only from this cookie
  (`src/lib/auth/dal.ts`); `getCurrentUser` re-reads the user and rejects
  tokens whose `sv` (session version) is stale.
- A new token is issued on every login. Changing the password, redeeming a
  reset link, and **Sign out everywhere** bump `User.sessionVersion`,
  voiding every older token (`src/server/actions/settings.ts`,
  `src/lib/auth/password-reset.ts`). Tested in
  `src/lib/auth/auth-hardening.integration.test.ts`.
- Login: same message for unknown email and wrong password; unknown emails
  are checked against a dummy bcrypt hash so timing matches
  (`src/server/actions/auth.ts`). Limits: 10 per 15 min per
  address+email, and 30 per 15 min per email from all addresses (applies to
  non-existent emails too, so it reveals nothing).
- Password reset: 32 random bytes, only the SHA-256 digest stored, 1-hour
  expiry, single use with an atomic claim, earlier links voided on issue,
  token carried in the URL fragment (never sent to servers or Referer).
  Request answers identically whether or not the account exists, does the
  lookup and email after the response (`after()`), and is limited per
  address and per email (`src/server/actions/password-reset.ts`).
- Change password: needs the current password; 5 tries per 15 min per user.

### Authorization
- Every server action calls `requireUserOrThrow()` and scopes every query
  by `userId` (`updateMany`/`deleteMany where {id, userId}`); foreign keys
  from the client (class ids, including AI-suggested ones) are re-checked
  with `assertOwnsClass` (`src/server/actions/class-ownership.ts`).
  Ownership tests: `src/server/actions/ownership.integration.test.ts`,
  `src/lib/canvas/service.integration.test.ts`, `src/lib/teams/service.integration.test.ts`,
  `src/server/actions/study-sessions.integration.test.ts`.
- Id arguments are validated as strings (`IdSchema`,
  `src/lib/validation/import.ts`): server actions accept any serializable
  value, and an object such as `{ not: "" }` would be a Prisma filter.
- Admin: `isAdmin` is only settable in the database. Admin actions check it
  (`src/server/actions/admin.ts`, `invite-codes.ts`,
  `password-reset.ts#createPasswordResetLink`), and **every admin page calls
  `requireAdmin()` itself**, not only the layout (Next renders a page
  segment without its layout on client-side navigation). Enforced by
  `src/app/(app)/admin/admin-guard.test.ts`.

### CSRF, framing, browser hardening
- Server actions: Next's Origin/Host check. `SameSite=Lax` cookies.
- `/api/tutor` (POST) checks `Origin` itself. `/api/account/export` (GET)
  refuses `Sec-Fetch-Site: cross-site`. Cron routes need a bearer secret;
  the Stripe webhook needs a valid signature.
- Headers on every response (`next.config.ts`): CSP with every fetch
  directive limited to this origin (`default-src 'self'`, `connect-src
  'self'`, `img-src 'self' data: blob:`, `frame-src 'none'`,
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `upgrade-insecure-requests`), HSTS (2 years,
  `includeSubDomains`), `Cross-Origin-Opener-Policy: same-origin`,
  `X-Frame-Options: DENY`, `nosniff`, `strict-origin-when-cross-origin`,
  and a Permissions-Policy denying camera, microphone, geolocation and
  payment. External links use `rel="noopener noreferrer"`.
- **CSP limits, stated plainly:** `script-src` still allows
  `'unsafe-inline'`, so the CSP does not stop an injected inline script; it
  stops loading scripts, frames, images or connections from other origins
  (so exfiltration through those is blocked). React escapes all rendered
  text and React 19 refuses `javascript:` URLs, which is the main XSS
  defense. See "Deferred" for the nonce plan.
- **HSTS without preload:** preload is effectively permanent and requires
  every current and future subdomain of therushd.com to serve HTTPS.
  Submit to hstspreload.org only after confirming that (and that nothing
  like a mail or marketing tool needs plain HTTP on a subdomain).

### Rate limits
One Postgres-backed fixed-window limiter (`src/lib/auth/rate-limit.ts`,
table `RateLimitBucket`, SHA-256-hashed keys, atomic upsert, fails open on
a database error so an outage doesn't lock students out). Client address:
`x-real-ip` on Vercel, `cf-connecting-ip` on Cloudflare, else the first
`x-forwarded-for` entry (`src/server/actions/client-ip.ts`).

| What | Limit | Where |
|---|---|---|
| Signup | 10 / 15 min per address | `server/actions/auth.ts` |
| Login | 10 / 15 min per address+email; 30 / 15 min per email | `server/actions/auth.ts` |
| Password reset request | 10 / 15 min per address; 3 / hour per email | `server/actions/password-reset.ts` |
| Password reset redeem | 10 / 15 min per address | same |
| Change password | 5 / 15 min per user | `server/actions/settings.ts` |
| Tutor | 30 / hour per user, plus AI quotas | `app/api/tutor/route.ts` |
| All AI calls | plan daily/monthly quotas, concurrency, global budget, kill switch | `lib/ai/usage.ts` |
| Quick add (AI path) | 30 / 10 min per user, text capped at 300 chars | `server/actions/quick-add.ts` |
| Screenshot import | 20 / hour (extract), 20 / hour (commit) per user | `server/actions/import.ts` |
| Week import | 10 / hour per user | `server/actions/try-week.ts` |
| Canvas connect / refresh / sync, feed, Teams, course content | 10 / 15 min per user each | `server/actions/{canvas,feed,teams,course}.ts` |
| Feedback | 20 / hour per user | `server/actions/feedback.ts` |
| School inquiry | 5 / hour per address + honeypot | `server/actions/schools.ts` |
| Page-view beacon | 120 / hour per address, body ≤ 256 bytes | `app/api/pv/route.ts` |
| Invite-link visit count | 10 / hour per address | `app/r/[code]/route.ts` |
| Checkout / billing portal | 10 / 15 min per user | `server/actions/billing.ts` |
| Data export | 5 / hour per user | `app/api/account/export/route.ts` |

### Input validation and uploads
- Zod schemas for every action (`src/lib/validation/*`); AI output goes
  through the same schemas as hand-entered data.
- Photos/screenshots: type decided by magic bytes (PNG/JPEG/WebP), never
  the client's type or name; ≤ 8 MB each, ≤ 5 per request (2 for practice),
  request body ≤ 4 MB (`next.config.ts`); validated in memory, sent to the
  AI provider, never stored (`src/lib/upload/validate-image.ts`).

### Outbound requests (SSRF)
- Canvas API and calendar feeds (`src/lib/canvas/base-url.ts`,
  `ip-guard.ts`, `client.ts`, `src/lib/feed/fetch-feed.ts`): https only, no
  IP literals (incl. decimal/hex forms), ports, credentials or local
  suffixes; every resolved address must be public (loopback, RFC 1918,
  link-local/metadata, CGNAT, multicast, reserved, ULA, and IPv4 embedded
  in IPv6 are refused); the connection is pinned to the vetted addresses
  (no DNS-rebinding window); redirects are never followed; pagination may
  not leave the origin; connect/header/body timeouts; 6–8 MB caps.
- Microsoft and YouTube/Resend/Stripe hosts are fixed constants; Graph
  pagination links must stay on `https://graph.microsoft.com/v1.0/`.

### Secrets and credentials
- Canvas tokens, Teams refresh tokens and calendar feed URLs: AES-256-GCM
  with a random IV, bound to the user id as associated data
  (`src/lib/canvas/token-vault.ts`); the ciphertext is selected in one
  function and never returned to clients or exported.
- Teams OAuth (`src/app/api/integrations/teams/*`, `src/lib/teams/oauth.ts`):
  authorization code + PKCE (S256), random state in an httpOnly cookie
  scoped to the callback path, single use, bound to the signed-in user id,
  10-minute life. No ID token is consumed, so no nonce is needed.
- Stripe webhook: signature verified on the raw body; events recorded in
  the same transaction for idempotency (`src/lib/billing/webhook.ts`).
- Cron: `Authorization: Bearer $CRON_SECRET`, timing-safe compare,
  refuses everything if the secret is unset or short (`src/lib/jobs/cron-auth.ts`).
- Email unsubscribe: HMAC-SHA256 of the user id (domain-separated, keyed by
  `SESSION_SECRET`), timing-safe; GET shows a confirm button, POST acts, so
  link scanners can't unsubscribe anyone (`src/lib/email/unsubscribe.ts`).
- Next's server-function argument logging is off (it printed passwords and
  tokens) (`next.config.ts`). `.env` is gitignored.

### Errors and logs
- Actions return hand-written messages; route handlers map provider errors
  to fixed strings; production Next hides stack traces; error boundaries
  never render `error.message`. `/api/health` reports status only.
- Structured logs (`src/lib/log.ts`): JSON lines with level, event and
  request id; fields named like content or secrets (message, draft, text,
  body, token, password, email, ...) are redacted unless numeric; errors are
  reduced to name and code, **never the message** (Prisma messages embed
  query arguments). Tests: `src/lib/log.test.ts`.
- Request ids: `x-request-id` (if safe) → `x-vercel-id` → random, echoed on
  API responses (`src/lib/request-id.ts`).
- Product events store counts, ids and enums only (`docs/METRICS.md`).

### Data rights
- **Download my data** (Settings → Privacy → `/api/account/export`): streams
  every user-owned table as JSON. Driven by `USER_DATA` in
  `src/lib/data-rights/user-data.ts`; excludes the password hash, session
  version, encrypted tokens/feed URL, reset-token hashes, and other
  students' ids. `user-data.test.ts` parses `prisma/schema.prisma` and fails
  if a user-owned table isn't registered (**new tables: add one line**).
- **Delete account** (`src/lib/data-rights/delete-account.ts`): deletes the
  Stripe customer first (cancels any subscription), then the user; schema
  cascades remove everything else; `AiRejection` rows (no foreign key) are
  deleted explicitly; `AiUsage` keeps cost rows with `userId` set to null.
  `data-rights.integration.test.ts` seeds every table, deletes, and checks no
  row in any table still references the user.

## Findings fixed in this pass (October 2026)

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | Admin pages relied on the admin layout's check; Next renders page segments without re-running the layout on client navigation, so admin data (growth, inquiries with emails, AI spend) could reach a non-admin. Not reproduced with a hand-built request in dev, fixed per Next's guidance. | `requireAdmin()` in every admin page + guard test |
| 2 | Medium | Deleting an account left the Stripe subscription billing (only our copy was cascaded). | Delete the Stripe customer first; refuse if it can't be cancelled |
| 3 | Medium | Quick add sent unbounded text to the AI (one large paste = real token cost). | Cut to 300 chars; AI path limited to 30 / 10 min |
| 4 | Medium | Login limit keyed only on address+email: guesses spread over many addresses were unlimited per account. | Per-account limit (30 / 15 min) |
| 5 | Medium | Import commit had no validation (invalid dates → 500, negative minutes, unbounded titles, non-array input). | Zod schema + rate limit |
| 6 | Low | Change password had no attempt limit (a borrowed session could guess the current password). | 5 / 15 min |
| 7 | Low | `AiRejection` rows kept the user id after account deletion. | Deleted with the account; cascade test |
| 8 | Low | Plan-snapshot and analytics failures logged whole Prisma errors, which include query arguments. | Structured logger, error name/code only |
| 9 | Low | On the Cloudflare deployment the rate-limit address was the client-controlled first `x-forwarded-for` entry. | Platform-aware client address |
| 10 | Low | Feedback, checkout/portal and screenshot extraction had no limits; Stripe failures showed an error page. | Limits + handled errors |
| 11 | Low | Assignment/exam/class actions accepted Prisma filter objects as ids (still scoped to the caller). | String id validation |
| 12 | Low | Plan-item events accepted any action name and unbounded ids. | Enum + length validation |
| 13 | Low | Page-view beacon read an unbounded body; invite-visit counts could be inflated by a script. | 256-byte cap; per-address limit |
| 14 | Low | Teams OAuth start returned a 500 on a malformed `MICROSOFT_TENANT_ID`. | Redirect with "unavailable" |
| 15 | Info | CSP only restricted framing/base/form; no HSTS or COOP. | Tightened CSP, HSTS, COOP |

## Deferred, accepted, or needs a third party

- **Nonce-based `script-src`** (deferred). It needs `proxy.ts` to mint a
  nonce per request and every page rendered per request. Two blockers:
  (1) Next 16 runs `proxy.ts` on Node.js, and the Cloudflare Workers build
  (`@opennextjs/cloudflare`, deployed by `.github/workflows/deploy-cloudflare.yml`
  on every push to main) refuses Node middleware; (2) the public pages are
  static today (`next build`: 14 public pages plus icons, OG images, robots and sitemap), so nonces would make the pages dynamic and
  uncached. Path: retire the Cloudflare build (or confirm OpenNext supports
  Node proxy), then add `proxy.ts` with `script-src 'self' 'nonce-…'
  'strict-dynamic'`, read the nonce in the root layout (pass it to
  `ThemeProvider`'s `nonce`), and verify with `e2e/smoke-crawl.spec.ts`
  against `next build && next start` (it fails on CSP violations).
- **Deleting an account doesn't ask for the password again** (Low,
  deferred: UX decision). Mitigated by the CSRF checks and typed "DELETE".
- **Signup says when an email already has an account** (Low, accepted).
  Fixing it needs email verification at signup; it's rate limited.
- **Logging out clears this browser's cookie only**; a copied token stays
  valid until it expires (30 days) unless the student uses Sign out
  everywhere or changes the password (Low, accepted for a stateless session).
- **Unsubscribe links never expire** (by design for RFC 8058 one-click);
  rotating `SESSION_SECRET` invalidates them (and every session).
- **Canvas and Teams ciphertexts share one key and AAD prefix**; a user's
  Canvas ciphertext could be swapped into their own Teams row. No
  cross-user effect (Info).
- **Rate limiter fails open** when the database errors (deliberate).
- **Dependencies:** `npm audit` reports 12 high advisories, all in build
  and dev tooling (braces/micromatch/fast-glob via `shadcn` and
  `eslint-config-next`; deepmerge-ts via the Prisma 6 CLI config loader).
  None is reachable from user input at runtime. `npm audit fix` has no
  non-breaking fix; the suggested "fixes" are downgrades (shadcn 1.0,
  eslint-config-next 14) or Prisma 7, which this project deliberately
  doesn't use yet. Re-check monthly.
- **Needs the founder / a third party:**
  - An independent penetration test before a school pilot at scale.
  - SOC 2 (Type I, then II) if districts require it; nothing is in place.
  - Counsel review of COPPA (students under 13 are refused at signup by
    self-attestation only), FERPA (school-official exception and a DPA
    template for districts), and state student-privacy laws (e.g. SOPIPA,
    NY Ed Law 2-d), plus the Terms and Privacy Policy.
  - Signed DPAs with subprocessors (Vercel, Neon, Anthropic, Resend, Stripe).
  - Decide whether the Cloudflare Workers deployment is still wanted; it
    holds a copy of `DATABASE_URL` and `SESSION_SECRET` in GitHub secrets
    and is redeployed on every push.
  - Error monitoring with PII scrubbing (e.g. Sentry) and log retention
    longer than Vercel Hobby's.

## Checklist for new code

- Server action: `requireUserOrThrow()`, Zod-validate every argument
  (ids with `IdSchema`), scope every query by `userId`, re-check client
  foreign keys, return hand-written errors, rate-limit anything expensive
  or that sends email/creates third-party objects.
- Route handler: same, plus an Origin or `Sec-Fetch-Site` check for
  cookie-authenticated mutations, `Cache-Control: no-store` on personal
  data, and `withRequestIdHeader`.
- New table with a `userId`: `onDelete: Cascade` (or explicit deletion in
  `delete-account.ts`), and one line in `USER_DATA`.
- Logging: `log.info/warn/error(event, fields)`; never put content,
  emails, tokens or error messages in fields.
- AI: only through `src/lib/ai` with `reserveAi`, bounded input and output.
- Outbound fetch to a user-supplied host: reuse the Canvas guards.
