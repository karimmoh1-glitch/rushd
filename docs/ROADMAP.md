# Rushd — Roadmap

Long-term vision: UNDERSTAND → PLAN → EXECUTE → LEARN → ADAPT — an academic
operating system, not a to-do list. See `docs/PRODUCT.md`. Phases below are
deliberately sequential — each one should be genuinely usable before the
next starts, per "do not build everything at once."

## Phase 1 — Foundation (done)

Auth, database, onboarding, classes, assignments, exams, basic dashboard,
design system. Shipped and verified end-to-end (signup → onboarding →
CRUD → dashboard), commits through `92ea053`.

## Phase 1.5 — Redesign + hardening (done)

Not new capability — making Phase 1 good enough to be the foundation for
everything else, per the section-47 UI/UX audit:
- Dashboard redesigned around a prominent Today section and a calm,
  status-driven greeting ("You're on track")
- Dedicated weekly Plan screen, nav rebuilt around the student mental
  model (Home/Plan/Assignments/Exams/Classes/Settings), a curated mobile
  bottom-nav rather than the desktop nav shrunk down
- `AIProvider` abstraction so AI features aren't hard-coded to one vendor
- `docs/AI_ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/PRIVACY.md`,
  `docs/USER_RESEARCH.md`
- Dark mode fixed — it had complete CSS from the very first commit but
  nothing ever applied the `.dark` class; now wired through next-themes
  with a working toggle, verified across the app and marketing site

## Phase 2 — The core Rushd engine (screenshot import done; planner modes deferred)

The first genuinely usable Rushd, per the spec: screenshot upload → AI
extraction → confirmation review → workload estimation → plan → adaptive
rescheduling. Shipped: screenshot upload with server-side magic-byte file
validation, vision-based extraction (never persists the image), an
editable per-item review screen with honest confidence signals, and bulk
commit into the existing planning engine — which then schedules it
exactly like manually-entered work, no special-casing.

Deliberately **not** built as a literal "Recommended Plan vs. Custom Plan"
toggle — see `src/app/(app)/plan/page.tsx`'s comments. There's one planning
engine; "custom" is editing your own availability, which already drives
what gets scheduled. Building a second, mostly-redundant algorithm just to
have two buttons would be complexity without a real behavioral difference.

**What-if planning** ("I can't study Wednesday" → recalculated plan with an
explained redistribution) is real Phase 2/3 scope but is deferred past this
pass — it needs the weekly Plan screen to exist first as something to
simulate changes against.

## Phase 3 — Execution (not started)

Study sessions with timers, start/pause/complete/skip, "how long did this
actually take" capture, actual-vs-estimated tracking, workload analytics
and the forward-looking workload forecast ("11h estimated next week, 7h
available").

## Phase 4 — Rushd Intelligence (not started)

Assignment deep-understanding ("what is this asking," "what might be
difficult"), the Rushd Tutor (diagnose → explain → practice → evaluate, not
a generic chatbot), concept mapping and mastery tracking. This is where
`Concept`/`ConceptMastery`/`TutorSession` tables get added — not before,
per "do not blindly create every table."

## Phase 5 — Personalization (not started)

Learning profile (strong/weak subjects, work patterns, planning behavior),
personalized time estimates from real estimate-vs-actual history,
personalized planning recommendations.

## Phase 6 — Integrations (not started)

Canvas API, Google Calendar, Outlook, additional import methods. Explicitly
not a Phase 1/2 dependency — screenshot import exists precisely so the
product works without any of these.

## Phase 7 — Growth (not started)

Referrals, sharing, study groups, collaborative sessions, shared course
resources. Architected for (schema shouldn't need violent surgery to add
these), not built — per "do not build a social network in V1" and "real
usage beats vanity metrics."

## Explicitly not planned regardless of phase

- Fake growth mechanics, artificial virality loops
- Gamification (streaks, badges, leaderboards) unless real usage data
  specifically shows it helps — contradicts the calm/trustworthy direction
  by default
- A generic "chat with AI" page — every AI surface is purpose-built
  (quick-add, screenshot import, eventually the tutor), never an empty
  chat box
