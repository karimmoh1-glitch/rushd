# Rushd

رُشد — guidance, sound judgment, being on the right path.

Rushd is a free academic planning platform for high-school students. It turns classes, assignments, exams, and available study time into a single prioritized, adaptive plan. See [docs/PRODUCT.md](docs/PRODUCT.md) for the product thesis and [docs/PLANNING_ENGINE.md](docs/PLANNING_ENGINE.md) for how the core scheduling algorithm works.

## Architecture

Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui, PostgreSQL via Prisma 7, hand-rolled sessions (bcrypt + jose + httpOnly cookie), an optional Anthropic integration with a deterministic fallback that always works without it. Full reasoning in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local setup

Requirements: Node 20+, a local PostgreSQL server.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `DATABASE_URL` — point it at a local Postgres database (create one first, e.g. `createdb rushd_dev`).
- `SESSION_SECRET` — generate with `openssl rand -base64 32`.
- `ANTHROPIC_API_KEY` — optional. Leave blank to run entirely on the deterministic fallback parser.

Run migrations, then start the dev server:

```bash
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up, complete onboarding, and you're in.

## Environment variables

See [.env.example](.env.example) for the full list with descriptions. Validated at startup via `src/lib/env.ts` (Zod) — the app fails fast with a clear message if something required is missing, rather than failing confusingly later.

## Database

Prisma schema: [prisma/schema.prisma](prisma/schema.prisma). Useful commands:

```bash
npm run db:migrate   # create/apply a migration in dev
npm run db:studio    # browse the database visually
```

## Tests

Three layers, each with its own command:

```bash
npm test              # unit tests (Vitest) — pure logic, no database
npm run test:integration  # integration tests — real Postgres, see below
npm run test:e2e      # Playwright, golden-path flow against the dev server
```

Integration tests run against a **separate** database so they never touch dev data — create it once:

```bash
createdb rushd_test
DATABASE_URL="postgresql://<user>@localhost:5432/rushd_test?schema=public" npx prisma migrate deploy
```

`npm run test:integration` points itself at `rushd_test` automatically (see `src/test/setup-integration.ts`); override with a `DATABASE_URL` env var if your test DB lives somewhere else. Each test creates its own user and cleans up after itself.

`npm run test:e2e` needs the dev server reachable at `localhost:3000` (Playwright starts it if it isn't already running) and runs against whatever database `.env`'s `DATABASE_URL` points to — it creates a uniquely-emailed user per run rather than requiring a separate database.

## Development workflow

```bash
npm run typecheck   # tsc --noEmit
npm run lint         # eslint
```

Run both plus the unit test suite before committing. The codebase has no comments explaining *what* code does (names should already say that) — comments exist only where something non-obvious needs explaining (a workaround, an invariant, a deliberate tradeoff).

## Deployment

1. Provision a managed Postgres database (Neon, Supabase, Railway, RDS — any works, it's just a connection string).
2. Deploy the Next.js app (Vercel is the path of least friction for this stack; any Node host works).
3. Set the environment variables from `.env.example` in your hosting provider — `DATABASE_URL` pointing at production Postgres, a freshly-generated `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL` set to your real domain, and `ANTHROPIC_API_KEY` if you want AI quick-add parsing live.
4. Run migrations against the production database: `DATABASE_URL=<prod-url> npx prisma migrate deploy`.
5. To promote a user to admin, update their row directly: `UPDATE "User" SET "isAdmin" = true WHERE email = '...'`. This is intentionally not an in-app control.

## Project structure

```
src/
  app/
    (marketing)/    # public: landing, privacy, terms, contact
    (auth)/         # signup, login
    (app)/          # authenticated: dashboard, classes, assignments, exams, settings, admin
    onboarding/
  components/ui/    # shadcn primitives
  lib/
    planning/       # the deterministic scoring + scheduling engine — start here
    auth/           # session, password hashing, the DAL (ownership checks live here)
    ai/             # optional AI client + the deterministic fallback parser
    validation/     # Zod schemas shared between client forms and server actions
  server/actions/    # all mutations — every one derives identity from the session, never client input
prisma/
  schema.prisma
docs/
  ARCHITECTURE.md
  PRODUCT.md
  ROADMAP.md
  PLANNING_ENGINE.md
```
