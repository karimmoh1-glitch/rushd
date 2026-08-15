# Rushd — Privacy (engineering reference)

This is the internal, technical companion to the public
`/privacy` page (`src/app/(marketing)/privacy/page.tsx`) — what's actually
implemented, for engineering decisions, not the student-facing copy.

## What's collected and why

| Data | Why | Where |
|---|---|---|
| Email, password hash | Auth | `User` |
| Display name, grade, school, timezone, goals | Personalization, planning | `Profile` — school and goals are always optional |
| Classes, assignments, exams, study availability | The planning engine runs on this — it's the product | `Class`, `Assignment`, `Exam`, `StudyAvailability` |
| Product events (signup, plan_generated, etc.) | Answer "is Rushd helping" | `Event` |
| Feedback | Product iteration | `Feedback` |

## What's deliberately NOT collected or retained

- **Uploaded screenshots are never persisted.** Sent to the AI provider
  in-memory for a single extraction call, discarded immediately after. See
  `docs/AI_ARCHITECTURE.md`. No screenshot ever touches disk or a database
  row.
- No phone number, address, or payment info (the product is free).
- No ad-tracking, no third-party analytics pixels, no data broker
  integrations.

## Third parties data reaches

- **Anthropic** (when `ANTHROPIC_API_KEY` is configured): quick-add text
  and, once shipped, screenshot images, for the single API call that
  extracts/parses them. Subject to Anthropic's own data handling terms.
  Nothing else is ever sent — no bulk export, no other student's data.
- No other third party receives student data. No analytics SaaS, no email
  marketing platform, nothing.

## Retention and deletion

Account deletion (`src/server/actions/settings.ts` → `deleteAccount`) is
immediate and cascades through every table via `onDelete: Cascade` in
`prisma/schema.prisma` — no soft-delete, no grace period, no residual row
anywhere tied to that user id. This is deliberate: "delete your account"
should mean it, and a grace period adds complexity for a threat model
(accidental deletion) better solved by a clear confirmation step, which
the UI already requires (type "DELETE" to confirm).

## Minors

The primary user base is high-school students, plausibly under 18 in most
jurisdictions. Rushd doesn't collect anything beyond what's listed above,
doesn't run ads, doesn't sell data — the practical exposure is low, but
this hasn't been reviewed against COPPA/FERPA/state student-privacy law by
counsel. Do that review before any wider public launch beyond
founder/friends testing. Flagging explicitly rather than silently assuming
"privacy-friendly practices" is the same as "legally compliant" — it isn't,
necessarily, and this doc shouldn't imply otherwise.
