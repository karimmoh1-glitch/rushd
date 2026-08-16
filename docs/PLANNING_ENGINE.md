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
- **No partial-completion tracking**: an `IN_PROGRESS` assignment is still
  scheduled with its *full* `estimatedMinutes` every time, not "time
  remaining after what's already been done." `StudySession` now *records*
  actual time spent per session (see below), but `build-work-items.ts` does
  not yet subtract completed session minutes from `remainingMinutes` — that
  wiring is intentionally deferred until there's a real product decision
  about how partial progress should affect scheduling (e.g., should 45
  minutes already spent reduce today's suggestion, or just inform tomorrow's
  estimate?). The data to make that decision correctly now exists; the
  decision itself hasn't been made yet.
- **No cross-day session memory**: the engine has no idea whether a
  previously *suggested* session actually happened at that specific
  time — only whether the underlying assignment/exam is now `COMPLETED`
  (see Adaptive Behavior below). It re-derives the whole schedule from
  scratch on every generation rather than incrementally patching a prior one.
- **Single-user, single-timezone availability**: `StudyAvailability` doesn't
  support one-off exceptions (e.g., "not available this Friday") — only a
  recurring weekly pattern.

## Extensibility (documented seams, not implemented)

Everything below describes *where* future capabilities would plug into the
engine, not a commitment to build them now. The point of writing this down
is that none of it requires replacing `scoreItem()`/`generatePlan()` — the
engine's job stays "take structured inputs, produce a ranked/scheduled
output," and every extension is either a new input, a new named component in
`ScoreBreakdown`, or a new pure function alongside `explain.ts`/`forecast.ts`
that reads the engine's output. If a future feature ever seems to require
rewriting `score.ts` or `schedule.ts` from scratch, that's a signal the
feature is being designed wrong, not that the engine needs replacing.

| Future capability | Where it plugs in | Why no engine rewrite is needed |
|---|---|---|
| **Personalized time estimates** | `build-work-items.ts` — `remainingMinutes` is computed from `Assignment.estimatedMinutes`/`Exam.prepMinutes` today; a personalized estimate (e.g., "this student's actual pace for this class") would just be a different value plugged into the same field. | `score.ts`/`schedule.ts` never care *where* `remainingMinutes` came from — only that it's a number. This is the single highest-leverage seam in the whole engine. |
| **Assignment decomposition** (subtasks) | `build-work-items.ts` again — instead of one `WorkItem` per `Assignment`, emit one `WorkItem` per subtask, each inheriting the parent's `classId`/`priority`/`dueAt` but its own smaller `remainingMinutes` and its own `id`. | The engine already treats assignments and exams as an undifferentiated `WorkItem[]`; it has no idea "assignment" is even a meaningful grouping above the item level. Fan-out happens before the engine sees the data. |
| **Knowledge gaps / concept mastery** | A new named component in `ScoreBreakdown` (e.g. `conceptGapBonus`), computed in `build-work-items.ts` from a mastery lookup, added into the `score` sum in `score.ts` the same way `examProximity` and `effortTiebreak` were added. | `ScoreBreakdown` was designed as an open, named-component sum specifically so a new factor is additive — see `docs/PLANNING_ENGINE.md` history: `examProximity` and `effortTiebreak` were both added this way, after the original three-component design. |
| **Exam preparation depth** (concept-targeted study, not just proximity) | Same seam as knowledge gaps — once `conceptGapBonus` exists, exam prep becomes "weight concept gaps higher when an exam is close," not a separate mechanism. | No new seam required beyond the one above. |
| **Student preferences** (e.g. "mornings only," "no back-to-back sessions in the same class") | `buildDailyCapacity()` and the inner scheduling loop in `generatePlan()` — preferences shape *when* capacity is offered and *which* day a chunk lands on, not the score. | Scoring and scheduling are already decoupled (`scoreAndRank()` doesn't know about days; `generatePlan()` doesn't know about score components) — preferences are purely a scheduling-side concern. |
| **Workload forecasting** | Already shipped (`forecast.ts`) as a separate pure function consuming `ScoredItem[]` — no changes to `score.ts`/`schedule.ts` were needed to add it. | This is the proof of the pattern: analysis features are read-only consumers of the engine's output, not modifications to the engine. |
| **What-if simulation** ("what if I can't study Wednesday") | No new seam at all — `generatePlan()` is already a pure function of `PlanInput`. A what-if is: construct a second `PlanInput` with modified `availability`, call `generatePlan()` again, diff the two `PlanResult`s. | This only works *because* the engine has no hidden state and no side effects. Purity isn't an abstract nicety here — it's the entire reason simulation is cheap instead of requiring a parallel "simulation mode." |
| **Adaptive replanning** | Two layers: (1) already shipped — every mutation calls `regeneratePlanSnapshot()`, so the plan is always recomputed from current reality; (2) not shipped — *session-level* adaptivity (did a suggested session actually happen?) needs a `StudySession` model to have anything to adapt to. See the audit's Study Session section in the conversation this doc was updated from. | Layer 1 required zero engine changes (it's a caller behavior, `src/server/actions/plans.ts`). Layer 2 is gated on new data existing, not on engine capability. |

## The first feedback loop: StudySession

Everything above describes PREDICT and PLAN. `StudySession` (`prisma/schema.prisma`,
`src/server/actions/study-sessions.ts`) is Rushd's first EXECUTE → MEASURE step:
a raw observation of what the engine predicted right before a student started
working, and what actually happened.

At `startSession()`, the server builds the exact same `WorkItem` the live plan
would for that assignment/exam and runs it through `scoreItem()` — never a
client-supplied number — then denormalizes the result onto the `StudySession`
row: `plannedMinutes`, `predictedScore`, `reasonCode`, plus `title`/
`className`/`classColor` as they were *at that moment*. This is deliberate
denormalization, not an oversight — a session is a historical record, and
shouldn't silently reinterpret itself if the assignment is later renamed or
its estimate edited. At completion, the student confirms (not the engine
assumes) `actualMinutes` — elapsed browser time is only ever a pre-filled
suggestion, because time a tab was open isn't the same thing as time spent
working.

The engine itself (`score.ts`, `schedule.ts`) is untouched by any of this —
`StudySession` is purely an observation layer that calls into the engine the
same way a page render does, then records what it saw.

## Future estimation architecture (documented, not implemented)

Once enough `StudySession` rows exist, personalized time estimates should
start as **simple statistical aggregation**, not machine learning and not an
LLM call — consistent with "AI interprets, deterministic systems decide."
The shape:

```
personalized estimate = baseline estimate
                       × student-specific historical multiplier
                       × assignment-type multiplier
```

Where the baseline is today's `Assignment.estimatedMinutes`/`Exam.prepMinutes`
(a teacher- or student-entered guess), and each multiplier is
`avg(actualMinutes) / avg(plannedMinutes)` computed from that student's own
completed `StudySession` rows — overall, and grouped by class (`className`)
once there's enough volume per group to be meaningful (a handful of sessions
isn't a reliable ratio; this needs a minimum-sample-size floor before a
multiplier is trusted over the raw baseline). This is the same "start simple,
grow sophisticated with usage" principle as the scoring engine itself: no
model training, no LLM duration prediction, just `sum(actual) / sum(planned)`
over real observations — auditable, explainable, and consistent with
`explain.ts`'s existing "the real reason is already known exactly" approach.

This is explicitly **not being built yet** — it needs a real volume of
`StudySession` data first, which is the entire point of shipping the
observation layer before the estimation layer.

**Update:** the read side of this now exists — `src/lib/insights/build-insights.ts`
computes exactly this ratio (`avg(actualMinutes)/avg(plannedMinutes)` per class,
gated behind a minimum-sample floor) and surfaces it on `/insights` as "takes
X% longer/shorter than estimated," alongside completion-rate-by-time-of-day and
busiest-day observations from the same `StudySession` data. What's still not
built is the *write* side: feeding that multiplier back into `score.ts`/
`schedule.ts` so `estimatedMinutes` itself gets personalized. Insights is
read-only by design for now — showing a student the pattern first, before the
engine silently starts acting on it, keeps trust intact per the "the real
reason is already known exactly" principle above. Wiring the multiplier into
the actual `remainingMinutes` calculation is the natural next step once this
has been observed working for real students.

## Adaptive behavior

The engine itself is stateless — "adaptive" means the *caller* regenerates
the plan (calls `generatePlan()` again with fresh inputs) whenever something
that affects scoring or scheduling changes:

- an assignment/exam is completed, added, edited, or deleted
- study availability changes
- enough real time has passed that "today" and the horizon shift

See `src/server/actions/plans.ts` for where regeneration is triggered.
