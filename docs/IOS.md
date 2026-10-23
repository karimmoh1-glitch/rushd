# A real iPhone app: assessment and staged plan (October 2026)

## Where things stand (updated October 23, 2026)

- **Stage 1 (API) is built and tested; not deployed.** `/api/v1` gives native
  clients token auth (15-minute access tokens, rotating refresh tokens with
  reuse detection, revoked by sign out, sign out everywhere, and password
  changes), Today, assignments (list, add, edit, mark done / not done),
  courses, and study sessions (start, complete, abandon). It reuses the web's
  services and ownership checks: the server actions and the API now call the
  same functions in `src/lib`. 32 integration tests cover auth and every
  endpoint's ownership 404s. Docs: `docs/API.md`, `docs/openapi.json`.
  Production needs the `20261023100000_mobile_refresh_tokens` migration
  applied before this code is deployed.
- **Stage 2 (shared package) is not done.** The app keeps its own copies of
  a few small helpers (duration formatting, brand colors) and hand-written
  API types instead of a workspace package. That's deliberate for now: the
  heavy logic (planning, ranking, reasons) runs on the server and reaches the
  app through the API, so there's little to share yet.
- **Stage 3 (Expo app) exists in `mobile/` and is partly verified.** Sign in,
  Today, Assignments (mark done, add), Courses and a course, the study
  session timer (complete and abandon), and Settings (sign out, sign out
  everywhere). Typechecked, unit tested (API client: refresh on 401, shared
  refresh, sign-out on refused refresh, error mapping), `expo-doctor` clean,
  and driven end to end through Expo's web build at 390×844 in dark and light
  (`e2e/mobile-app.spec.ts`). It has **not** run on an iPhone or in the iOS
  Simulator (no Xcode on the build machine), so native rendering, the
  keyboard, safe areas, and VoiceOver order still need checking on a device.
  Missing from stage 3: an offline read cache (the app shows an offline
  banner and keeps what's on screen, but nothing persists between launches),
  exams CRUD, and editing study times or courses in the app.
- How to run it on a phone with Expo Go, and the steps to TestFlight, are in
  `mobile/README.md`.
- Stages 4 and 5 below have not started.

### Before this work

- Rushd was a responsive web app (Next.js) plus a desktop app that wraps the
  website in Tauri v2 (`desktop/`). The responsive site works in mobile
  Safari and can be added to the home screen (it has a web manifest), but
  that is not an App Store app.
- Most product logic that a phone app would need is plain TypeScript with no
  browser or server dependency: planning and scoring (`src/lib/planning`),
  Pulse, streaks, the "rank my week" parser (`src/lib/try`), time-zone
  helpers, and the course catalog.

## Options

1. **Wrap the website (Tauri v2 mobile or a WebView shell).** Fastest, but a
   thin wrapper around a website risks rejection under Apple's minimum
   functionality guideline (4.2), and offline, notifications, and native
   feel would all be weak. Not recommended as the App Store path.
2. **A native client with Expo / React Native (recommended).** Shares the
   pure TypeScript logic above, talks to a small authenticated API, and gives
   real notifications and offline behavior.

## Staged plan for option 2

1. **API first (web repo, testable now):** versioned JSON endpoints for Today,
   assignments, courses, study sessions, and settings, reusing the same
   services and ownership checks as the server actions; token auth for mobile
   (short-lived access token + revocable refresh token tied to the existing
   session version); rate limits; OpenAPI description.
2. **Shared package:** move the pure logic into a workspace package used by
   both the web app and the mobile app, with the existing unit tests.
3. **Expo app, read-mostly:** sign in, Today, ranked assignments, start/finish
   a study session; offline read cache; VoiceOver labels, Dynamic Type,
   focus order.
4. **Notifications:** opt-in only, same rules as study emails (a streak nudge
   at most once a day, a Sunday plan), via APNs.
5. **Store readiness (needs you):** Apple Developer Program membership,
   signing certificates, an App Store Connect record, privacy "nutrition
   label" answers, in-app account deletion (already on the web; Apple
   requires it in the app when accounts can be created in the app), age
   rating and the minors question, TestFlight beta with real students before
   any submission.

Nothing has been submitted, and Rushd is not App Store ready. Steps 1–3 can
be built and tested without Apple credentials; step 5 cannot. Apple will
also expect in-app account deletion; today the app links to web Settings.
