# Rushd — Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16.3.1 (App Router, Turbopack), React 19, TypeScript | Server components + server actions let the planning engine run server-side, close to the data, without a separate API layer. One deployable unit. |
| Styling | Tailwind CSS v4 + shadcn/ui (Base UI primitives) | Accessible primitives (focus management, keyboard nav, ARIA) out of the box; fully ownable source (not a black-box component lib) so the design system stays restrained instead of drifting toward generic-SaaS look. Base UI, not Radix — shadcn switched its default primitive library; a few APIs differ from Radix-based docs/examples found online (e.g. `DropdownMenuItem` uses `onClick` not `onSelect`, `asChild` is a `render` prop). |
| Database | PostgreSQL | Relational integrity for a scheduling domain (foreign keys, cascades, constraints matter more here than schema flexibility). |
| ORM | Prisma 7.9.1 (`prisma-client` generator, driver adapters) | Type-safe queries, first-class migrations, good DX for a solo-maintained project. Prisma 7 requires an explicit driver adapter (`@prisma/adapter-pg`) and moves the datasource URL to `prisma.config.ts` rather than `schema.prisma`. |
| Auth | Hand-rolled sessions: bcrypt password hashing + `jose`-signed JWT in an httpOnly cookie, following the Data Access Layer pattern from Next.js's own auth guide | This app was scaffolded on Next.js 16.3, released after most third-party auth libraries' Next-16 compatibility was verifiable at build time. Rather than take a dependency-version risk on a brand-new major, auth uses the pattern Next.js's official docs document as secure: `bcrypt` (cost 12) for password hashing, `jose` to sign/verify a JWT session payload (`userId` only — no PII in the token), an httpOnly/secure/sameSite=lax cookie, and a memoized `verifySession()` DAL that every server action and page calls. `proxy.ts` (Next 16's renamed `middleware.ts`) does an optimistic redirect for signed-out users; the real authorization check happens in the DAL on every read/write, never in the proxy alone. Revisit if/when a maintained auth library confirms Next 16 support and the team wants OAuth. |
| Validation | Zod | Every server action validates input server-side, independent of client state. Also used to validate structured AI output before it touches the database. |
| AI | Anthropic Messages API (optional) | Used only for two narrow, schema-validated tasks: parsing quick-add text into a structured assignment, and generating a plain-language "why this is prioritized" explanation. Both features detect a missing `ANTHROPIC_API_KEY` and fall back to deterministic logic — the product never depends on AI being configured. |
| Testing | Vitest (unit + integration), Playwright (e2e) | Vitest for the planning engine's pure functions and Prisma-backed integration tests; Playwright for the signup → plan → complete flow. |
| Deployment target | Vercel (app) + managed Postgres (Neon/Supabase/Railway) | Zero-config fit for Next.js; Postgres is provider-agnostic via `DATABASE_URL`. Not deployed as part of this build — see README for deployment steps. |

Local dev uses a Homebrew-installed Postgres 16 instance rather than Docker, since Docker wasn't available in the dev environment.

## Why not more

- No separate backend service — Next.js server actions + route handlers are the API. Splitting this into a separate API service would add a deployment unit and a network hop with no present benefit.
- No Redis/queue — the planning engine runs synchronously on request (it's a scoring/sort over a bounded per-user dataset, not a background job). Rate limiting on auth routes uses a small DB-backed counter instead of standing up Redis for one feature.
- No OAuth in the MVP — email/password covers the core workflow; OAuth providers can be added later without schema changes (Auth.js already models `Account` separately from `User`).
- No design system package — shadcn/ui components are copied into the repo (`src/components/ui`) and edited directly. One app, one design system; a shared package would be premature.

## High-level structure

```
src/
  app/                     # Next.js App Router routes
    (marketing)/           # landing, privacy, terms, contact — public, static-friendly
    (auth)/                # signup, login, reset
    (app)/                 # authenticated dashboard, classes, assignments, exams, settings
    admin/                 # internal-only, gated by isAdmin flag
    api/                   # route handlers (auth callback, ai quick-add)
  components/
    ui/                    # shadcn primitives
    ...                    # feature components
  lib/
    planning/              # deterministic scoring + scheduling engine (pure functions, unit-tested)
    auth/                  # Auth.js config, session helpers, ownership guards
    ai/                    # AI client + fallback parser, Zod schemas for AI output
    validation/            # shared Zod schemas
    db.ts                  # Prisma client singleton
  server/
    actions/               # server actions per domain (classes, assignments, exams, plans, feedback)
prisma/
  schema.prisma
  migrations/
docs/
  ARCHITECTURE.md
  PRODUCT.md
  ROADMAP.md
  PLANNING_ENGINE.md
```

## Authorization model

`src/proxy.ts` (Next 16's renamed `middleware.ts`) does an **optimistic**
redirect only — it reads the session cookie and bounces signed-out visitors
away from protected prefixes, but never queries the database and is not the
real authorization boundary. Every server action and protected page enforces
the actual check itself, via `src/lib/auth/dal.ts`:

1. `requireUser()` / `requireAdmin()` (pages, redirect on failure) or
   `requireUserOrThrow()` (server actions, throw on failure) resolve the
   current user from the session cookie server-side — never from
   client-supplied input.
2. Every read/write is scoped to that user's own rows at the query level —
   `findFirst`/`updateMany`/`deleteMany` all filter on `{ id, userId }`
   together, rather than fetching by `id` alone and checking ownership
   in application code afterward. A mismatched `id`/`userId` pair simply
   matches zero rows.
3. For `Assignment`/`Exam` writes, any client- or AI-supplied `classId` is
   re-verified against the actual owner via `assertOwnsClass()`
   (`src/server/actions/class-ownership.ts`) before the write — this holds
   even when the `classId` came from an AI suggestion (quick-add, screenshot
   import), not just from a plain form.
4. Failures return a generic "not found" error rather than "forbidden" for
   rows owned by another user, to avoid leaking existence.

This is deliberately *not* a single generic `requireOwned(record)` helper —
ownership is enforced inline in each query's `where` clause instead, which
means there's no code path that fetches a row before checking who owns it.

## Environment variables

See `.env.example`. Validated at startup via a Zod schema in `src/lib/env.ts` — the app fails fast with a clear message if a required variable is missing, rather than failing confusingly at first use.
