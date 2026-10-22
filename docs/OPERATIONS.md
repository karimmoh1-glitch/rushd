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

## Database migrations

Generate offline with `prisma migrate diff`, keep them additive, and apply with
`node --env-file=.env scripts/apply-migrations.mjs --apply`.

## Risks to address

- Local development uses the production database. Create a Neon branch for
  development and point `.env` at it.
- No error monitoring (e.g. Sentry) yet.
- Password reset needs an email provider; today an admin issues reset links.
