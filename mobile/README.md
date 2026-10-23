# Rushd for iPhone (Expo)

A React Native app built with Expo (SDK 58), expo-router, and TypeScript. It
talks to the Rushd web app's versioned API (`/api/v1`, see `../docs/API.md`).
It is its own package: nothing here is part of the web build, and the web's
TypeScript, ESLint, Vitest and Vercel deploys all ignore this folder.

**Status (honest):** it has been typechecked, unit tested, and run as a web
build (react-native-web) at iPhone size against a local API, through every
screen. It has **not** been run on a real iPhone or in the iOS Simulator
(this machine has no Xcode), and it has not been built with EAS or submitted
anywhere. Expect small native differences (fonts, keyboard, safe areas) the
first time you open it on a phone.

## What's in it

| Screen | What it does |
| --- | --- |
| Sign in | Email + password against `/api/v1/auth/token`. Accounts are created on the web. |
| Today | Next up (tinted with the course color, reasons from the planner, saffron Start session), today's study blocks, coming up with status chips, this week's bars, study time per course. |
| Assignments | Ranked by Pulse like the web. Tap the circle to mark done (a short check animation; none with Reduce Motion). Add assignment. |
| Courses / Course | Identity tiles: color rule, level and code, term progress, open work. A course shows its open assignments and exams with Start session. |
| Session | Big timer from the server's start time. Finish with the minutes you actually studied and how it felt, or stop with an optional reason. |
| Settings | Account details, sign out, sign out everywhere (every device and the web). |

Everywhere: pull to refresh, loading skeletons, empty and error states, an
offline banner over stale data, and a token refresh on 401 (one refresh at a
time; if the server refuses it, the app returns to sign in).

Design: graphite dark by default, light when the phone is in light mode,
saffron for the one primary action, Newsreader for titles, Geist for UI, and
the Rushd mark with رُشد in Amiri (the same SVG paths as the web's
`RushdMark`). Accessibility: labels and roles on every control, Dynamic Type
(font scaling on, capped on the largest headings), 44pt touch targets, safe
areas, and Reduce Motion respected (`AccessibilityInfo.isReduceMotionEnabled`).

Tokens are stored in the iOS keychain with `expo-secure-store`
(`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, not synced to iCloud). The web preview has
no keychain and uses `localStorage`; that is for development only.

## Run it on your iPhone with Expo Go

You need: the Expo Go app from the App Store, and your iPhone and Mac on the
same Wi-Fi.

1. Start the web app (it serves the API) so the phone can reach it:

   ```bash
   cd ..                      # the web app
   set -a; . ./.env; set +a
   npm run dev -- --port 3104 --hostname 0.0.0.0
   ```

2. Find your Mac's LAN IP: `ipconfig getifaddr en0` (for example `192.168.1.23`).

3. Start the app, pointing it at that address:

   ```bash
   cd mobile
   npm install
   EXPO_PUBLIC_API_URL=http://192.168.1.23:3104 npx expo start
   ```

4. Scan the QR code with the iPhone camera; it opens in Expo Go.

5. Sign in with an account you created on the web (`http://192.168.1.23:3104/signup`).

Once the API is deployed to production (see `../docs/API.md`, "Before
production"), use `EXPO_PUBLIC_API_URL=https://therushd.com` instead and the
Mac's server isn't needed. `EXPO_PUBLIC_*` values are baked in when the
bundle is built, so restart `expo start` after changing it.

If the phone can't connect: make sure the dev server listens on `0.0.0.0`
(step 1), the macOS firewall allows Node, and both devices are on the same
network (guest Wi-Fi often isolates devices). `npx expo start --tunnel` works
around network isolation for the bundle, but the API URL still has to be
reachable from the phone.

## Checks

```bash
npm run typecheck     # tsc --noEmit
npm test              # vitest: the API client (refresh, errors) and formatting
npx expo-doctor       # dependency and config checks
```

The whole app at phone size, through the web build, from the web repo root:

```bash
cd mobile && EXPO_PUBLIC_API_URL=http://localhost:3104 npx expo export --platform web && cd ..
# serve mobile/dist on :8104 with an index.html fallback (any static server), then:
MOBILE_APP_URL=http://localhost:8104 MOBILE_OUT=/tmp/shots E2E_PORT=3104 npx playwright test e2e/mobile-app.spec.ts
```

## Path to TestFlight (EAS Build)

None of this has been done yet. What it takes:

1. **Apple Developer Program** membership ($99/year) for the account that will
   own the app. Organization enrollment needs a D-U-N-S number.
2. **An Expo account** (free) and `npx eas-cli@latest login`.
3. **Bundle identifier.** `app.json` uses `com.therushd.app` as a placeholder;
   change it to one you own before the first build. It can't be changed after
   the App Store Connect record exists.
4. `npx eas-cli@latest build:configure` (creates `eas.json`), then
   `npx eas-cli@latest build --platform ios --profile production`. EAS asks to
   sign in to your Apple account and can create and store the distribution
   certificate and provisioning profile for you. No Xcode needed.
5. **App Store Connect record** for the app (name, bundle id, SKU), then
   `npx eas-cli@latest submit --platform ios` uploads the build to TestFlight.
   An App Store Connect API key (Issuer ID, Key ID, .p8 file) lets EAS submit
   without your password.
6. **Production API.** TestFlight builds must point at the deployed API
   (`EXPO_PUBLIC_API_URL=https://therushd.com` in the EAS build profile's
   `env`), which needs the `mobile_refresh_tokens` migration applied first.
7. **Before external testers or review:** privacy "nutrition label" answers,
   a privacy policy URL, an age rating (Rushd has students under 18), and
   in-app account deletion: Apple requires it when accounts can be used in the
   app. Deletion is on the web today; the app currently links to web
   Settings, which may not satisfy review. A sign-in screen with no way to
   create an account in-app is allowed, but reviewers need a demo account.

Internal TestFlight testing (your own team, up to 100 people) needs only
steps 1–6; external testers need a short Beta App Review.
