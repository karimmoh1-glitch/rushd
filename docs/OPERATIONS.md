# Operating Rushd

## Environment variables (Vercel project `rushd`, production)

| Variable | Status | Purpose |
|---|---|---|
| `DATABASE_URL` | set | Neon Postgres (shared with local dev today; see Risks) |
| `SESSION_SECRET` | set | Signs session cookies |
| `NEXT_PUBLIC_APP_URL` | set | `https://therushd.com` |
| `CANVAS_TOKEN_ENCRYPTION_KEY` | set | AES-256-GCM key for Canvas tokens |
| `ANTHROPIC_API_KEY` | **missing** | Turns on the tutor, practice checks, rubric reviews, quick add, screenshot import |
| `AI_MONTHLY_BUDGET_USD` | optional | Global AI spending ceiling; default 25. Overridden by the value saved on /admin/ai |
| `AI_KILL_SWITCH` | optional | `on` pauses every AI feature regardless of database settings |
| `YOUTUBE_API_KEY` | optional | YouTube Data API v3 key; enables verified video suggestions (otherwise search links only) |
| `STRIPE_SECRET_KEY` | **missing** | Use `sk_test_…` until live billing is reviewed |
| `STRIPE_WEBHOOK_SECRET` | **missing** | Signing secret of the endpoint `https://therushd.com/api/stripe/webhook` |
| `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO` | **missing** | Price ids of the monthly Plus ($10) and Pro ($20) prices |

Billing turns on only when all four Stripe variables are present; until then the
pricing page says paid plans are opening soon and everyone is on Free.

### Turning on billing in test mode

1. In the Stripe dashboard (test mode), create products "Rushd Plus" and "Rushd Pro"
   with monthly prices of $10 and $20. Copy the price ids.
2. Add a webhook endpoint `https://therushd.com/api/stripe/webhook` listening to
   `checkout.session.completed` and `customer.subscription.created|updated|deleted|paused|resumed`.
   Copy its signing secret.
3. Enable the customer portal (Settings › Billing › Customer portal) with
   cancellation allowed.
4. Add the four variables to Vercel production and redeploy.
5. Buy Plus with test card 4242 4242 4242 4242; confirm Settings shows Plus and
   /admin/ai shows the higher limits apply.

Before live keys: review the Terms (billing and refunds), confirm how you'll
handle purchases by minors, and check sales-tax obligations (Stripe Tax).

## AI cost controls

All AI calls go through `reserveAi → provider → settleAi/failAi`
(`src/lib/ai/usage.ts`). Reservation runs in one Postgres transaction under an
advisory lock and checks, in order: kill switch, global monthly ceiling, plan
feature allowance, plan monthly cost cap, daily request limit, concurrency.
Settled cost is computed from provider-reported tokens at list prices
(`src/lib/ai/pricing.ts`); reconcile with the Anthropic invoice.

Per-request bounds: tutor turns are capped at 7 model calls × 4,000 output
tokens and a 60 s function limit; checks and reviews are single calls with
`max_tokens` 6,000 / 16,000 and request timeouts.

Plans and allowances live in `src/lib/billing/plans.ts` (single source; the
pricing page and the enforcement both read it).

## Desktop releases

`desktop/` is a Tauri v2 wrapper of the web app. Push a tag `desktop-vX.Y.Z`
(matching `desktop/src-tauri/tauri.conf.json`) to build and publish a GitHub
pre-release. After verifying the files, update `src/lib/desktop-release.ts` so
the download page links them. Builds are unsigned until Apple Developer ID and
Windows signing credentials are added (see `desktop/README.md`).

## Health checks and uptime monitoring

`GET /api/health` (also `HEAD`) is public, uncached and cheap: it returns
the app version, the deployed commit (`VERCEL_GIT_COMMIT_SHA`), the
environment, and a database ping with a 2-second timeout. It answers **200**
with `"status":"ok"` when the database responds, **503** with
`"status":"degraded"` when it doesn't. It never includes secrets or user data.

Set up a monitor (any of UptimeRobot, Better Stack, Checkly, or Vercel's
own monitoring; free tiers are enough):

1. Monitor `https://therushd.com/api/health`, every 1–5 minutes, from two
   or more regions. Alert on a non-200 status or a response slower than
   ~5 s, after 2 consecutive failures (one blip isn't an incident).
2. Add a keyword check for `"status":"ok"`.
3. Second monitor on `https://therushd.com/` (the static homepage) so you
   can tell "app down" from "database down".
4. Send alerts to email *and* phone. Send the header
   `X-Request-Id: uptime-<name>` so the monitor's requests are easy to find
   in logs.
5. Cron health: `/admin` shows the last run of each cron job. Optionally add
   a heartbeat monitor (Better Stack/Healthchecks.io) and have it alert if
   the daily job's `cron.daily.done` log line or `/admin` timestamp is older
   than 26 hours.

## Logs and request ids

Server code logs JSON lines through `src/lib/log.ts`
(`{"ts","level","event","requestId",...}`). Fields named like content or
secrets are redacted and errors are logged as name/code only, so logs can be
shared with a vendor or a contractor without exposing student work. Route
handlers echo `X-Request-Id` (the caller's, if well-formed; else Vercel's
`x-vercel-id`; else a random UUID); when a student reports a problem, ask
for the time and, if they can, that header from the failing request.
`LOG_LEVEL=debug|info|warn|error` (default `info`).

Find lines in Vercel → Project → Logs (filter by `"event":"…"` or the
request id). Vercel Hobby keeps runtime logs about an hour; for longer
retention add a log drain (Vercel → Settings → Log Drains, e.g. Better
Stack/Axiom) before a pilot. Useful events: `cron.daily.done`,
`cron.evening.done`, `cron.job_failed`, `cron.unauthorized`,
`stripe.webhook_failed`, `stripe.webhook_bad_signature`,
`tutor.turn_failed`, `teams.oauth_callback_rejected`,
`rate_limit.check_failed_open`, `health.db_unavailable`,
`account.deleted`, `account.export_started`.

## Features when a key is missing

Each optional integration checks its own configuration and degrades to a
clear "not available yet" state; none of them errors because a key is
absent (verified by the smoke crawl, `e2e/smoke-crawl.spec.ts`, which runs
with none of them set).

| Missing | What students see |
|---|---|
| `ANTHROPIC_API_KEY` | Tutor, practice checks, draft review, screenshot import show "not available on this server yet"; quick add and week import use the deterministic parser; planning and mastery math are unaffected |
| `YOUTUBE_API_KEY` | Search links (Khan Academy/YouTube) instead of verified videos |
| any of `STRIPE_*` (all four needed) | Pricing says paid plans are opening soon; webhook answers 503; everyone is Free |
| `MICROSOFT_CLIENT_ID`/`_SECRET` | Teams isn't mentioned publicly; its settings page says it's unavailable |
| `RESEND_API_KEY` or `EMAIL_FROM` | Forgot-password says emails aren't available (admins issue reset links); study emails are off |
| `CANVAS_TOKEN_ENCRYPTION_KEY` | Canvas, Teams and the calendar feed report themselves unavailable |
| `CRON_SECRET` | Cron routes refuse every call (401), so nothing syncs or emails |

## Backups and restore (Neon)

Neon keeps a continuous history of the database (the "history window"),
which allows point-in-time restore of a root branch to any moment inside
it. Defaults per plan, from Neon's docs (checked October 2026; confirm in
your console): **Free: 6 hours (max 6 hours, 1 GB of history); Launch:
1 day by default, up to 7 days; Scale: 1 day by default, up to 30 days.**
Set it in the Neon console → project → Settings → Postgres → History
window. On a paid plan, raise it to 7 days or more before real students
depend on Rushd; 6 hours is not enough to notice and undo a bad deploy over
a weekend.

Restore (destructive for the branch; existing connections drop briefly):

- Safest: create a **new branch from a past point in time** (console →
  Branches → Create branch → "Past data"), inspect it, and copy back only
  what you need, or point `DATABASE_URL` at it in an emergency.
- Whole branch: console → the branch → Backup & Restore → Restore from
  history → pick a timestamp; Neon keeps the pre-restore state as a backup
  branch. CLI: `neon branches restore main ^self@2026-10-22T09:00:00Z --preserve-under-name main_before_restore`.
- Only root branches support instant restore.

Independent copy: Neon history lives with Neon. Before a pilot, add a
weekly logical dump stored elsewhere, e.g. from a trusted machine:
`pg_dump "$DATABASE_URL" --format=custom --no-owner -f rushd-$(date +%F).dump`
(encrypt it; it contains student data; keep ~4 weeks; delete older ones).
Test a restore into a scratch Neon branch once a quarter.

## Incident checklist

1. **Confirm and scope.** Which monitor fired? `curl -s https://therushd.com/api/health`.
   Is it everyone or one feature? Check Vercel → Deployments (did a deploy
   just go out?) and Logs (filter `"level":"error"`).
2. **Stop the bleeding.**
   - Bad deploy: Vercel → Deployments → previous good deployment →
     **Promote to Production** (instant rollback). Then investigate.
   - AI cost spike or bad AI output: `/admin/ai` → turn AI off (instant), or
     set `AI_KILL_SWITCH=on` and redeploy.
   - Database down/slow: check status.neon.tech and the Neon console
     (compute suspended? connection limit?). The app shows errors but
     doesn't lose data.
   - Abuse (signup/login floods): rate limits apply automatically; for a
     sustained attack enable Vercel's Firewall / Attack Challenge Mode.
   - Bad data written by a bug: stop writes (rollback), then restore from
     Neon history into a **new branch** and repair from there.
3. **Suspected breach or leaked secret.** Rotate the affected secret
   (below), review Vercel/Neon/GitHub access logs and members, preserve
   logs. If student data may have been exposed, get legal advice promptly:
   US state breach laws and school contracts have notification deadlines
   (some as short as 72 hours from discovery for school data).
4. **Communicate.** Tell affected students (and schools, if any) what
   happened, what data, and what to do; plain language, no speculation.
5. **Afterwards.** Write a short timeline, cause, and what prevents a
   repeat; add a test or monitor for it.

## Rotating secrets

Change the value in Vercel (`npx vercel env rm NAME production --scope …`
then `npx vercel env add NAME production --scope …`), redeploy, and
confirm `/api/health` and the affected feature. Never paste values into
chat, commits or tickets.

| Secret | How to make a new one | Effect of rotating |
|---|---|---|
| `SESSION_SECRET` | `openssl rand -base64 32` | Everyone is signed out; old unsubscribe links and shared streak-card links stop verifying (new emails carry new links). Rotate immediately if leaked. |
| `CANVAS_TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` | Stored Canvas tokens, Teams refresh tokens and calendar feed links can't be decrypted: students must reconnect (nothing else is lost). There is no dual-key support yet; rotate only if leaked. |
| `CRON_SECRET` | `openssl rand -hex 32` | Update it in Vercel; Vercel Cron sends the new value after redeploy. |
| `DATABASE_URL` | Neon console → Roles → reset password for the app role (or create a new role), copy the new connection string | Old connections fail; redeploy promptly. Also update the GitHub secret used by the Cloudflare workflow, if that deployment is kept. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys → create; then delete the old key | None for students. |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → roll key (Stripe lets the old key live for a set time) | None if done within the overlap. |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint → roll signing secret | Webhooks fail signature checks until the new value is deployed; Stripe retries for 3 days, so nothing is lost. |
| `MICROSOFT_CLIENT_SECRET` | Entra → App registrations → Rushd → Certificates & secrets → new secret, then delete the old | Expires on its own (max 24 months): put the date in your calendar. |
| `RESEND_API_KEY` | Resend → API Keys → create, delete old | None. |
| `YOUTUBE_API_KEY` | Google Cloud → Credentials → regenerate | None. |

## Database migrations, safely

1. Change `prisma/schema.prisma`; write a new folder
   `prisma/migrations/<timestamp>_<name>/migration.sql` generated offline
   with `npx prisma migrate diff --from-schema-datamodel <old schema> --to-schema-datamodel prisma/schema.prisma --script`.
   **Never run `prisma migrate dev` or `db push` against production.**
2. Keep migrations additive (new tables, nullable columns, new enum
   values). Renames and drops are two releases: stop using the column,
   deploy, then remove it later.
3. Try it on a Neon branch made from production first (console → Branches →
   Create branch from `main`): point a local `DATABASE_URL` at the branch and
   run `node --env-file=.env scripts/apply-migrations.mjs` (dry run) then
   `--apply`; run the app against it.
4. Note the time (for a point-in-time restore), then apply to production
   with the same script, **before** deploying code that reads the new
   columns: `node --env-file=.env scripts/apply-migrations.mjs` → check the
   pending list → `--apply`.
5. Deploy, check `/api/health` and the feature, and delete the test branch.
6. Known issue: the migration history can't build a fresh database from
   zero (see `docs/AUDIT-2026-10.md`); local databases use
   `scripts/setup-local-db.sh`.

## Risks to address

- No error monitoring (e.g. Sentry with PII scrubbing) yet; Vercel Hobby
  keeps logs about an hour. Add a log drain before a pilot.
- Password reset needs an email provider; until `RESEND_API_KEY` is set an
  admin issues reset links.
- The Cloudflare Workers workflow (`.github/workflows/deploy-cloudflare.yml`)
  still deploys every push to main with production secrets from GitHub.
  Decide whether that deployment is wanted; if not, disable the workflow and
  delete the Worker and the GitHub secrets.
- See `docs/SECURITY.md` → "Deferred" for security items still open.
