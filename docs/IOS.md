# A real iPhone app: assessment and staged plan (October 2026)

## Where things stand

- Rushd is a responsive web app (Next.js) plus a desktop app that wraps the
  website in Tauri v2 (`desktop/`). There is **no iOS app**. The responsive
  site works in mobile Safari and can be added to the home screen (it has a
  web manifest), but that is not an App Store app.
- The web app talks to its server mostly through Next.js server actions and
  an httpOnly session cookie. There is no documented, versioned API a native
  client could call, and no token-based mobile auth.
- Most product logic that a phone app would need is already plain TypeScript
  with no browser or server dependency: planning and scoring
  (`src/lib/planning`), Pulse, streaks, the "rank my week" parser
  (`src/lib/try`), time-zone helpers, and the course catalog.

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

Nothing in this document has been submitted, and Rushd is not App Store
ready. Steps 1–3 can be built and tested without Apple credentials; step 5
cannot.
