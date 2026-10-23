# Launch checklist: what only you can do

Everything on branch `platform` is built and tested locally (unit,
integration against a local Postgres, end-to-end, accessibility, visual, and a
production build). Nothing in this list was done for you, because each step
touches production, money, an outside account, or a judgment call.

Do them roughly in this order.

## 1. Ship the code (needs your go-ahead)

- [ ] **Review `platform`** on GitHub (branch `platform`; open a PR into
  `main` to read the diff). It merges: the visual pass, course details,
  learning core (topics, mastery, practice), mobile API, hardening, catalog
  and onboarding, planner and outcome dashboard, course-aware tutor, syllabus
  import, and page polish.
- [ ] **Apply the 7 new migrations to production first.** They're all
  additive (new tables, nullable columns, new enum values) and were rehearsed
  on a copy of production's current schema: all 7 applied in order, and the
  result matched the code's schema exactly.
  ```bash
  node --env-file=.env scripts/apply-migrations.mjs          # dry run: should list exactly these 7
  node --env-file=.env scripts/apply-migrations.mjs --apply
  ```
  `20261023090000_course_details`, `20261023100000_mobile_refresh_tokens`,
  `20261023110000_catalog_onboarding`, `20261023120000_learning_core`,
  `20261023150000_planner_adaptation`, `20261023160000_course_tutor`,
  `20261023170000_syllabus_import`.
  The code reads the new columns, so deploying before migrating breaks pages.
- [ ] **Decide where production runs.** There are two deploy paths today:
  - Vercel, deployed by hand with the CLI (see docs/SETUP.md).
  - A Cloudflare Worker that **deploys automatically on every push to `main`**
    (`.github/workflows/deploy-cloudflare.yml`, using production secrets
    stored in GitHub).

  Merging `platform` into `main` therefore deploys to Cloudflare immediately.
  Keep one and disable the other, so the two can't drift apart. The
  Cloudflare build is also what blocks a nonce-based CSP (docs/SECURITY.md).
- [ ] **Deploy, then smoke-test production:** `/api/health` returns `ok`,
  signup → onboarding → Today works, a course page opens, and Settings →
  Download my data works.

## 2. Turn on what's waiting for keys

Each of these features hides itself or says "not yet" until its key is set.
How to add each one is in docs/SETUP.md.

- [ ] **`ANTHROPIC_API_KEY`**. This is the biggest one. It turns on:
  - the course-aware tutor
  - AI practice questions
  - AI syllabus extraction (the rules-based reader works without it)
  - photo practice checks
  - draft feedback
  - screenshot import

  Then **try real conversations and real syllabi yourself**. Every AI path
  was tested only with a scripted model, so quality is unverified.
- [ ] **`RESEND_API_KEY` + `EMAIL_FROM`**: password resets, the Sunday plan,
  and streak reminders.
- [ ] `YOUTUBE_API_KEY`: video picks (until then it falls back to Khan
  Academy links).
- [ ] Stripe keys, test mode first: paid plans.
- [ ] `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET`: Teams import.

## 3. Operations (an afternoon)

- [ ] **Uptime monitor** on `https://therushd.com/api/health` (e.g. Better
  Stack or UptimeRobot, free tiers).
- [ ] **Error monitoring or a log drain.** Vercel Hobby keeps logs for about
  an hour. Logs are JSON lines without content (docs/OPERATIONS.md).
- [ ] **Backups.** Move Neon to a paid plan for a longer restore window (Free
  keeps 6 hours), and schedule a weekly `pg_dump` stored off Neon.
- [ ] **Make yourself admin** if you haven't (docs/SETUP.md §7). /admin shows
  cron runs, AI usage and growth.
- [ ] Fix the migration-history ordering (docs/AUDIT-2026-10.md, risk 1) so a
  fresh database can be built from migrations. It touches production's
  migration records, so do it deliberately.

## 4. The iPhone app (`mobile/`)

This is an Expo app built on the new `/api/v1`. It has **not** run on an
iPhone yet (this machine has no Xcode), only in Expo's web preview.

- [ ] Try it now with **Expo Go** on your phone against your Mac
  (mobile/README.md).
- [ ] Replace the placeholder bundle id `com.therushd.app` in
  `mobile/app.json` with one you own.
- [ ] Apple Developer Program ($99/year), an Expo account, an App Store
  Connect record, then EAS Build → TestFlight (mobile/README.md).
- [ ] Apple requires **account deletion inside the app** when accounts can
  be created in the app. Today the app links to the website for deletion.
- [ ] The production API must be deployed (step 1) before a TestFlight build
  can sign in.

## 5. Check the content I couldn't verify

- [ ] **IB subject list** in `src/lib/courses/catalog`. ibo.org blocked
  automated checking. The AP list was checked against College Board's pages
  and corrected.
- [ ] Skim the catalog's generic templates (docs/CATALOG.md). None carries an
  institution code or prerequisites, by design.
- [ ] There's no admin screen yet for students' **"Report a problem"**
  submissions on AI questions. Reports are stored in `QuestionReport`; read
  them with SQL until a screen exists.

## 6. Legal and trust (before any school pilot)

- [ ] Counsel review of COPPA (13+ gate today), FERPA, and state
  student-privacy laws.
- [ ] Signed DPAs with Vercel or Cloudflare, Neon, Anthropic, Resend and
  Stripe.
- [ ] A penetration test before a school or district pilot.
  docs/SECURITY.md lists what's in place and what isn't. There is no SOC 2.

## 7. Prove it works (the YC part)

Rushd has **no users, retention, or learning-gain numbers yet**. Don't put
any number in an application until it's measured.

- [ ] Recruit the pilot in docs/STRATEGY.md and docs/GROWTH.md: 10–15
  students with mixed course types (AP, college STEM, reading-heavy).
- [ ] Read activation, retention and outcome metrics from real data with the
  SQL in docs/METRICS.md. The events are already logged (ids and counts only).
- [ ] Validate the mastery thresholds against what students actually know
  (docs/MASTERY.md lists what to measure).
- [ ] YC Winter 2027: the on-time deadline listed was **November 2, 8pm PT**
  (check ycombinator.com/apply; dates change). Use the one-sentence
  description, what's live, and only measured evidence (docs/STRATEGY.md).

## Known gaps (built honestly, not hidden)

- Topic reviews appear on the web plan but not in the iPhone app yet. Review
  blocks can be skipped or deferred, but not pinned.
- Scanned (image-only) PDFs can't be imported; the screen says to paste the
  text instead.
- Every AI behavior is untested against a live model (see step 2).
- Once, under a heavily loaded dev server, Next left a hidden duplicate of a
  streamed page outside `<main>`. Users can't see it, and it never
  reproduced in isolation (4 repeat runs were clean). Worth checking against
  a production build after deploy. An app-wide `loading.tsx` reliably causes
  it, so there isn't one.
