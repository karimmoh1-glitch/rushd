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

## Phase 3 — Execution & forecasting (partially done)

Shipped this pass — all deterministic extensions of the existing planning
engine, no new AI dependency, so they work identically whether or not
`ANTHROPIC_API_KEY` is configured:
- **"One Thing"** — the single highest-scored item, surfaced as its own
  signature moment on the dashboard, not just the top row of a list
- **Real "Why?" explanations** (`src/lib/planning/explain.ts`) — plain-
  language reasons generated from the actual `ScoredItem.breakdown`
  (overdue, exam proximity, urgency, priority), not an AI-generated
  rationalization. This is deliberately *not* an LLM call: the real reason
  a deterministic scorer ranked something first is already known exactly,
  so asking a model to explain it would be strictly less trustworthy than
  just reading off the math.
- **Academic Forecast + overload risk** — this week / next week / following
  week workload buckets vs. available time, with a risk level and
  suggested interventions when projected to run short

Not started: study session timers (start/pause/complete/skip), capturing
actual-vs-estimated time per session, and feeding that back into the
scoring model's effort estimates. This is the prerequisite for real
per-student personalization (Phase 5) — without actual-time data, there's
nothing to personalize estimates *from*.

## Phase 4 — Rushd Intelligence (not started)

The largest remaining phase, and deliberately not started this pass —
each piece below needs real quality investment, not a first-draft version:

- **Assignment deep-understanding**: "what is this asking," "what
  concepts do I need," "what might be difficult," AI-generated subtask
  decomposition for large assignments
- **Rushd Tutor**: diagnose → explain → example → guided question →
  practice → evaluate → reinforce, never "just give the answer." Confidence-
  based follow-up (correct+low-confidence → reinforce; incorrect+high-
  confidence → misconception, not just a wrong-answer marker).
- **AI Assistant**: a single context-aware entry point (not a generic chat
  page) that can answer "what should I study," "how long will this take,"
  "I'm overwhelmed" — grounded in the student's actual workload/plan/
  mastery data, with graceful acknowledge-then-help-shrink-the-problem
  handling for overwhelm, and an explicit non-goal of being a therapist or
  encouraging emotional dependency
- **AP Exam Prep Hub**: per-course unit articles, flashcards (spaced
  repetition), mini quizzes, exam countdown — all *original* content
  aligned to publicly available AP course frameworks, never scraped or
  reproduced College Board material. This alone is a multi-course content
  project, not a schema change; building it shallowly for 15 AP courses
  would produce worse content than building it well for one and expanding.
- **Knowledge Graph** (the data model these all share):
  `Course → Unit → Topic → Concept → Skill → Practice → Mastery`, plus
  `TutorSession`/`TutorMessage` for conversation history. `Concept`/
  `ConceptMastery`/`TutorSession` tables get added when this phase
  actually starts — not before, per "do not blindly create every table."

## Phase 5 — Personalization (not started)

Learning profile (strong/weak subjects, work patterns, planning behavior)
built from Phase 3's actual-vs-estimated data, personalized time estimates,
personalized planning recommendations, the "What Rushd learned about you"
semester recap.

## Phase 6 — Simulation & integrations (not started)

What-if simulator ("what if I can't study Wednesday" → recalculated plan
with an explained redistribution — needs the weekly Plan screen as
something to simulate against, which now exists). Canvas API, Google
Calendar, Outlook, additional import methods — explicitly not a dependency
for anything before this; screenshot import exists precisely so the
product works without any LMS integration.

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
