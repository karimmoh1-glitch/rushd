# Rushd API v1

A small, versioned JSON API for Rushd's native clients (the Expo iPhone app in
`mobile/`). The web app does not use it; it keeps its server actions. Both go
through the same services in `src/lib`, so a rule (ownership, validation, the
planner's ranking) is enforced in one place.

- Base path: `/api/v1` (for example `http://localhost:3000/api/v1`, or the
  production URL once this is deployed).
- Machine-readable description: [`docs/openapi.json`](./openapi.json)
  (OpenAPI 3.1). A unit test (`src/app/api/v1/openapi.test.ts`) fails if a
  route or method is added or removed without updating it.
- Code: routes in `src/app/api/v1/**/route.ts`; plumbing in `src/lib/api/v1/`.
- Tests: `src/app/api/v1/v1.integration.test.ts` (`npm run test:integration`).

## Authentication

Bearer tokens only. The API never reads or sets cookies, so CSRF does not
apply, and a web session cookie is not accepted as a bearer token (the access
token is signed with a key derived from `SESSION_SECRET` for this purpose only).

| Token | Lifetime | Stored |
| --- | --- | --- |
| Access token (JWT, HS256) | 15 minutes | Nowhere on the server. Carries the user id, the user's session version, and the sign-in ("family") it came from. |
| Refresh token (43 random characters) | 60 days, renewed on every refresh | Only a SHA-256 digest, in `MobileRefreshToken` with the device label, created/last-used/revoked times. |

Every authenticated request checks, in the database, that the user still
exists, that their session version hasn't changed, and that the sign-in still
has an active refresh token. So all three of these take effect immediately,
not when the 15-minute access token runs out:

- **Sign out** (`POST /auth/logout`) revokes this device's sign-in.
- **Sign out everywhere** (`POST /auth/logout {"everywhere": true}`, or the
  web's Settings button, or a password change or reset) bumps
  `User.sessionVersion`, which voids every web session and every mobile
  sign-in.
- **Reuse detection.** Every refresh rotates the refresh token. If an old
  (already rotated) or revoked refresh token is presented again, it was
  copied: every token from that sign-in is revoked and the answer is
  `401 refresh_token_reused`. Other devices' sign-ins are not affected.

### Flow

```http
POST /api/v1/auth/token
{"email": "student@example.com", "password": "…", "deviceName": "Layla's iPhone"}

200 {"accessToken": "…", "accessTokenExpiresAt": "…", "refreshToken": "…",
     "refreshTokenExpiresAt": "…", "tokenType": "Bearer", "onboardingCompleted": true}
```

Then send `Authorization: Bearer <accessToken>`. On `401` (`token_expired`,
or any 401 from a non-auth route), call `POST /auth/refresh
{"refreshToken": "…"}` once, store the new pair, and retry. If the refresh
itself answers 401, the sign-in is over: clear the stored tokens and show
sign in. Never run two refreshes with the same token at once; the second
would look like reuse (the Expo client serializes them).

Sign in uses the web login's exact check (`src/lib/auth/credentials.ts`): a
wrong password and an unknown email get the same `401 invalid_credentials`
"Invalid email or password." and take the same bcrypt time. Accounts are
created on the web (signup has an age confirmation and terms); there is no
signup endpoint yet.

## Errors

Every error has one shape:

```json
{ "error": { "code": "not_found", "message": "Assignment not found." } }
```

| Status | Codes |
| --- | --- |
| 400 | `invalid_request` (body isn't JSON, or fails validation; the message names the field) |
| 401 | `unauthorized`, `token_expired`, `invalid_credentials`, `refresh_token_invalid`, `refresh_token_reused` |
| 404 | `not_found`: the id doesn't exist **or belongs to another student** (the two look the same on purpose) |
| 409 | `conflict`: a study session is already in progress, or this one already finished |
| 429 | `rate_limited`, with a `Retry-After` header (seconds) |
| 500 | `internal` (details are logged by name only in production) |

## Rate limits

Postgres-backed fixed windows (`src/lib/auth/rate-limit.ts`), shared across
serverless instances, keys hashed. All windows are 15 minutes.

| Bucket | Limit |
| --- | --- |
| Sign in, per IP + email (the same bucket as the web login form) | 10 |
| Sign in, per IP | 30 |
| Refresh and logout, per IP | 120 |
| Any authenticated request, per IP (checked before the token) | 900 |
| Any authenticated request, per signed-in user | 600 |

## Endpoints

All responses are `Cache-Control: no-store`. Times are ISO 8601 UTC;
human labels (`dueLabel`, `dateLabel`, `timeLabel`) are already formatted in
the student's own time zone from their profile.

| Method and path | What it does |
| --- | --- |
| `POST /auth/token` | Email + password for a token pair. |
| `POST /auth/refresh` | Rotate the refresh token. |
| `POST /auth/logout` | `{refreshToken}` ends that sign-in; `{everywhere: true}` (with a bearer token) ends all of them and every web session. |
| `GET /me` | The student: id, email, display name, time zone, onboarding done. |
| `GET /today` | Next up (with up to three reasons read from the planner's real score), today's blocks, coming up with `dueStatus` (`overdue`/`today`/`soon`/`later`), the week's planned minutes per day, study time per course. Built from the same loaders as the web dashboard (`src/lib/today/`). |
| `GET /assignments?status=open\|completed\|all` | Open work ranked by Pulse, then due date (the web's order); then work Canvas stopped listing; then completed. |
| `POST /assignments` | `{courseId, title, dueAt, estimatedMinutes?, priority?, notes?}`; the course must be the student's. |
| `GET /assignments/:id` | One assignment. |
| `PATCH /assignments/:id` | `{status}` alone marks done / not done; other fields are merged and saved through the web's edit logic (Canvas keeps owning an imported assignment's title, date and course). |
| `GET /courses` | Courses with color, level, code, term progress, weekly goal, open and upcoming counts, study time in the last 7 days. |
| `GET /courses/:id` | One course with its open assignments and upcoming exams. |
| `GET /sessions/active` | The in-progress study session, or `null`. |
| `POST /sessions` | `{assignmentId}` or `{examId}` (exactly one), optional `source` (`MANUAL` default, or `PLANNED`). One in-progress session at a time. |
| `POST /sessions/:id/complete` | `{actualMinutes, difficulty?}`. The student confirms the minutes. |
| `POST /sessions/:id/abandon` | `{reason?}`. |

## CORS

Native apps send no `Origin` header and need no CORS. For browser clients:
in development, any `localhost`, `127.0.0.1`, or private-LAN origin is
allowed (this is what Expo's web preview uses). In production only origins
listed in `API_CORS_ORIGINS` (comma-separated, unset by default) are allowed.
Credentials are never allowed, because the API doesn't use cookies.

## Before production

- Apply migration `prisma/migrations/20261023100000_mobile_refresh_tokens`
  (one new table, additive) before deploying code that uses it.
- Nothing else is required: the access-token key is derived from the existing
  `SESSION_SECRET`. Rotating `SESSION_SECRET` signs out every web session and
  voids every outstanding access token (refresh tokens still work and mint
  new access tokens).
- Not built yet: account signup, exams CRUD, availability/settings edits,
  push notifications, and an offline cache. See `docs/IOS.md`.
