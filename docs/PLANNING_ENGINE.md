# Rushd — Planning Engine

This is the core of the product (see `docs/PRODUCT.md`). It is a deterministic,
pure function — no AI, no randomness, no hidden state. Given the same inputs
it always produces the same output, and every number in it is named and
documented so "why is this ranked here" always has a one-line answer.

Code: `src/lib/planning/`. Entry points: `scoreAndRank()` (prioritization
only) and `generatePlan()` (prioritization + scheduling into study time).

## Inputs

| Input | Source | Notes |
|---|---|---|
| Open assignments | `Assignment` where `status != COMPLETED` | Caller's query decides what counts as "open" — the engine doesn't filter by status itself. |
| Upcoming exams | `Exam` where `examAt` in the future (or recently past, caller's choice) | |
| Study availability | `StudyAvailability` (recurring weekly windows) | Expanded into concrete per-date minute totals for the planning horizon. |
| Current date/time | Passed in explicitly (`now: Date`), never read internally | Keeps the engine pure and trivially unit-testable — no `Date.now()` inside `src/lib/planning`. |
| Horizon | `horizonDays`, default 7 | How many days ahead to schedule. |

Each assignment/exam is converted to a `WorkItem` (`src/lib/planning/build-work-items.ts`)
with a single `remainingMinutes` figure — `Assignment.estimatedMinutes` or
`Exam.prepMinutes` — and a single `dueAt` — the due date or the exam date.
This lets assignments and exams share one scoring and scheduling path
instead of two parallel implementations.

## Scoring

`scoreItem()` (`src/lib/planning/score.ts`) computes five components and sums
them. All constants live in `src/lib/planning/constants.ts`.

| Component | Formula | Why |
|---|---|---|
| **Urgency** | `max(0, 100 - max(0, daysUntilDue) * 12)` | Linear decay: due today or overdue → 100, due in 8+ days → 0. Smooth, no cliff at any particular day count. |
| **Importance** | `priorityWeight[item.priority] + priorityWeight[class.priority] * 0.5` | `LOW=5, MEDIUM=15, HIGH=30`. The item's own priority matters most; the owning class's priority contributes at half weight, so a HIGH-priority class nudges everything in it up without drowning out the item's own priority. |
| **Overdue bonus** | `min(60, 40 + max(0, daysOverdue) * 2)` — only when `dueAt < now` (precise timestamp, not calendar day) | A flat penalty the moment something is late, growing slowly the longer it's ignored, capped so a assignment overdue by a month doesn't mathematically bury everything else forever. |
| **Exam proximity** | `(7 - daysUntil) * 8`, only for exams with `0 <= daysUntil <= 7` | Exams get materially more weight than assignments as they approach — a deliberate product requirement ("exams should receive stronger prioritization as they approach"). |
| **Effort tiebreak** | `clamp(20 - remainingMinutes/10, 0, 20) * 0.3` | A small nudge toward shorter tasks when everything else is close. Weighted at 0.3 so it can only break near-ties, never override urgency/importance/overdue. |

`score = urgency + importance + overdue + examProximity + effortTiebreak * 0.3`

### Reason codes

Each scored item gets one `reasonCode` — the single most salient factor,
chosen in this priority order: `OVERDUE` > `EXAM_PROXIMITY` > `DUE_SOON`
(urgency ≥ 60) > `HIGH_PRIORITY` (importance ≥ 30) > `STANDARD`. This is what
the UI shows as "why this is prioritized" (`REASON_LABELS` in
`constants.ts`) — a real, deterministic reason, not an AI-generated one. The
optional AI layer (`docs/ARCHITECTURE.md` → AI integrations) may later
rephrase this into a friendlier sentence, but the underlying reason always
comes from here, never from the model.

## Scheduling

`generatePlan()` (`src/lib/planning/schedule.ts`):

1. Score and rank every work item (highest score first).
2. Expand `StudyAvailability` into a per-date minute budget for every day in
   the horizon (`buildDailyCapacity`).
3. Walk items in score order. For each, walk forward day by day from today,
   allocating up to `MAX_SESSION_MINUTES` (90) from that day's remaining
   budget, until the item's full effort is scheduled or the horizon/due-date
   cutoff is reached.
4. If an item still has unscheduled effort after that, it's recorded in
   `unscheduledMinutesByItem` rather than silently dropped.

Because items are processed in score order and each consumes capacity as it
goes, higher-priority work always gets first claim on a day's available time
— the schedule *is* the priority order, applied to real time.

### Why a 90-minute session cap

Splitting large workloads (e.g., a 3-hour exam-prep block) across multiple
sessions/days instead of one sitting is a deliberate product choice, not a
scheduling limitation: spaced practice beats cramming, and it leaves room in
a busy day for other work to get a slice of the same day's availability too.

Concretely: each item gets **at most one session per day**, capped at 90
minutes, even if that day has far more free capacity than that. A 200-minute
item on a day with 10 free hours still only gets a single 90-minute block
today; the rest rolls to the next day(s) it has capacity, not into a second
block later the same day. If the horizon runs out before an item is fully
scheduled, the remainder shows up in `unscheduledMinutesByItem` — see below.

### Due-date cutoff vs. overdue catch-up

An item that isn't yet overdue is never scheduled *after* its own due date —
there's no point suggesting study time for something once it's too late for
that time to matter. An item that's already overdue is treated differently:
it keeps competing for any open capacity across the whole horizon, because
catching up is still the useful thing to do. This asymmetry is intentional.

## Edge cases and how they degrade

| Situation | Behavior |
|---|---|
| No `StudyAvailability` windows at all | `dailyCapacity` is all zeros → `sessions` is empty, but `scored` is still fully populated. The UI can show "what's most important" without "when to do it," and prompt the student to set availability. |
| More work than available time in the horizon | Lower-scored items receive partial or zero scheduled minutes; the shortfall is visible per item in `unscheduledMinutesByItem` rather than silently discarded. |
| An assignment/exam is already overdue | Gets the overdue bonus, and is still eligible for scheduling on any day in the horizon (see above), not just "before" its due date. |
| Everything has the same priority and due date | Falls back to the effort tiebreak (shorter first); still deterministic, no ties broken by insertion order or randomness. |
| Zero assignments/exams | `scored` and `sessions` are both empty arrays. The dashboard shows an explicit "nothing due" state, not a blank screen. |
| `estimatedMinutes`/`prepMinutes` unusually large (e.g., a 10-hour project logged as one item) | Gets spread across many sessions/days via the 90-minute cap; if it still doesn't fit the horizon, the remainder shows up in `unscheduledMinutesByItem`. |

## Known limitations (MVP)

- **Timezone**: `dueAt`/`examAt` and `StudyAvailability` windows are compared
  using the server/browser's notion of "today," not an explicit conversion
  through `Profile.timezone`. This works correctly as long as the student's
  device timezone matches their profile timezone (true for the near-total
  majority of real usage) but is not rigorously timezone-safe for a student
  traveling across zones. Documented, not silently wrong: see
  `src/lib/datetime-local.ts`.
- **No partial-completion tracking**: an `IN_PROGRESS` assignment is
  scheduled with its *full* `estimatedMinutes` every time, not
  "time remaining after what's already been done" — there's no field for
  partial progress in the MVP schema. `docs/ROADMAP.md` lists real
  effort-tracking as a near-term improvement.
- **No cross-day session memory**: the engine has no idea whether a
  previously *suggested* session actually happened at that specific
  time — only whether the underlying assignment/exam is now `COMPLETED`
  (see Adaptive Behavior below). It re-derives the whole schedule from
  scratch on every generation rather than incrementally patching a prior one.
- **Single-user, single-timezone availability**: `StudyAvailability` doesn't
  support one-off exceptions (e.g., "not available this Friday") — only a
  recurring weekly pattern.

## Adaptive behavior

The engine itself is stateless — "adaptive" means the *caller* regenerates
the plan (calls `generatePlan()` again with fresh inputs) whenever something
that affects scoring or scheduling changes:

- an assignment/exam is completed, added, edited, or deleted
- study availability changes
- enough real time has passed that "today" and the horizon shift

See `src/server/actions/plans.ts` for where regeneration is triggered.
