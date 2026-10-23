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
- **Uploaded syllabus files are never persisted.** A PDF, .docx, or text
  file is read in memory on the server (`src/lib/syllabus/extract-text.ts`)
  and dropped. Only the extracted text is kept, and only if the student
  confirms the import: it is saved as a `SYLLABUS` course material on their
  own course (visible to them and their tutor, deletable with the course or
  account). Preview writes nothing the student owns; the analytics events
  (`syllabus_import_started/_previewed/_confirmed`) carry counts only.
- No phone number, address, or payment info (the product is free).
- No ad-tracking, no third-party analytics pixels, no data broker
  integrations.

## Third parties data reaches

- **Anthropic** (when `ANTHROPIC_API_KEY` is configured): quick-add text
  syllabus text (up to 40,000 characters, only when AI is configured), and,
  once shipped, screenshot images, for the single API call that
  extracts/parses them. Subject to Anthropic's own data handling terms.
  Nothing else is ever sent — no bulk export, no other student's data.
- No other third party receives student data. No analytics SaaS, no email
  marketing platform, nothing.

## Export ("Download my data")

Settings → Privacy → Download my data streams a JSON file of every row the
student owns (`/api/account/export`, built from `USER_DATA` in
`src/lib/data-rights/user-data.ts`). It leaves out the password hash, the
session version, encrypted Canvas/Teams tokens and the calendar feed link,
reset-token hashes, and other students' ids (for invites). Rate limited to
5 per hour. A new table with a `userId` must be added to `USER_DATA` (a
test fails until it is).

## Retention and deletion

Account deletion (`src/server/actions/settings.ts` → `deleteAccount` →
`src/lib/data-rights/delete-account.ts`) is immediate: it deletes the
student's Stripe customer (which cancels any subscription), then the user,
and cascades through every table via `onDelete: Cascade` in
`prisma/schema.prisma`; `AiRejection` rows are deleted explicitly. AI cost
rows (`AiUsage`) are kept for spend accounting with `userId` set to null
(no content, no link to the person). No soft-delete, no grace period;
`data-rights.integration.test.ts` checks that no row in any table still
references a deleted user. Stripe keeps its own invoice records under its
retention rules. Neon's point-in-time history keeps deleted rows until the
history window passes (6 hours to 30 days depending on plan; see
`docs/OPERATIONS.md`). This is deliberate: "delete your account"
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
