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

`generatePlan()` (`src/lib/planning/schedule.ts`) is deterministic: the same
inputs always produce the same blocks (ranking ties break on due date, then
id, so database row order never matters).

All day-level reasoning happens in the **student's timezone**
(`Profile.timezone`, via `src/lib/time/zone.ts`), never the server's clock.
A Pacific 11:59 PM Friday deadline is Friday, even though the server (UTC)
sees Saturday 06:59.

1. Score and rank every work item (highest score first).
2. Build each day's **free intervals** from the weekly `StudyAvailability`
   windows. For today, time that has already passed is removed.
3. Place **pinned blocks** (`ScheduleBlock` rows the student locked, moved,
   or resized) first. They are fixed commitments: their time is removed from
   the free intervals, their minutes count toward the item's remaining work,
   and regeneration never moves them.
4. Walk items in score order. Each item may use days from
   `max(today, due date − LEAD_WINDOW_DAYS)` up to its due date (or the whole
   horizon if already overdue). On the due day, blocks must end by the due
   *time*, not just the due date.
   - **Pass 1, spread:** at most one block per day, sized to the student's
     preferred block length (`Profile.preferredSessionMinutes`, max 90).
   - **Pass 2, catch-up:** only if work would otherwise miss its deadline,
     extra blocks are packed into whatever capacity remains before it.
5. Blocks land at the earliest open time in a window, with a
   `DEFAULT_BREAK_MINUTES` gap after each, and never exceed the student's
   daily cap (`Profile.maxDailyMinutes`). Blocks shorter than
   `MIN_BLOCK_MINUTES` aren't created unless the whole task is that short.
6. Anything that still doesn't fit before its deadline becomes a
   `DEADLINE_SHORTFALL` warning (with the exact minutes) and is grouped into
   `OVERLOADED_DAY` warnings by deadline day. Nothing is silently dropped and
   nothing is quietly placed after its due time.

`generatePlanForUser()` schedules over `PLANNING_HORIZON_DAYS` (28) so a
crunch three weeks out is reported early; the plan page displays the first
`DEFAULT_HORIZON_DAYS` (7).

### Why spread first, then catch up

Spaced practice beats cramming, and spreading leaves room for other work on
busy days, so a big task gets one block per day by default. But the old rule
("one block per day, period") could leave work unscheduled on a day with
hours free while its deadline approached. Pass 2 fixes that: extra same-day
blocks appear only when a deadline genuinely requires them.

### The lead window

Work isn't planned more than `LEAD_WINDOW_DAYS` (14) before it's due. Without
this, importing a semester of Canvas assignments would fill this week with
work due in a month. Minutes held back this way are reported as
`deferredMinutesByItem`: not a problem, just not scheduled yet.

### Due-date cutoff vs. overdue catch-up

An item that isn't yet overdue is never scheduled after its due moment.
An item that's already overdue keeps competing for open capacity across the
whole horizon, because catching up is still the useful thing to do.

### Student control

The student can lock an auto-placed block (it becomes a `ScheduleBlock`),
move or resize it, unlock it, or regenerate from scratch (which unlocks all
future pinned blocks, after a confirmation that shows the count). Moves are
validated server-side: the item must be theirs and open, the day within the
planning horizon, not already past, and not overlapping another pinned
block. A block may be placed outside the student's availability; that's
their explicit choice.

## Edge cases and how they degrade

| Situation | Behavior |
|---|---|
| No `StudyAvailability` windows at all | No blocks; `scored` is still populated; a `NO_AVAILABILITY` warning prompts the student to set study time. |
| More work than time before a deadline | Higher-ranked work is placed first; each item's shortfall is reported (`DEADLINE_SHORTFALL`) and grouped by deadline day (`OVERLOADED_DAY`). |
| An assignment/exam is already overdue | Overdue bonus, and eligible for any open capacity in the horizon. |
| Everything has the same priority and due date | Effort tiebreak, then due date, then id. Deterministic. |
| Zero assignments/exams | Empty `scored` and `sessions`; explicit "nothing to plan" state. |
| A huge task (e.g. 10 hours) | Spread one block per day; extra blocks only where the deadline needs them; any remainder is reported as a shortfall. |
| Work due in five weeks | Not scheduled yet (lead window); reported as deferred, not as a problem. |
| Canvas removes an assignment | It's kept but marked `canvasRemovedAt` and excluded from planning. |

## Known limitations (MVP)

- **Timezone (manual entry only)**: planning and display use
  `Profile.timezone`. The one remaining assumption is in manual due-date
  entry: the browser converts the typed date/time using the *device's* zone
  (`src/lib/datetime-local.ts`). Canvas imports are exact instants and
  unaffected.
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
- **Auto blocks are recomputed, not remembered**: everything except pinned
  blocks is re-derived on every generation. A suggested block that the
  student skipped simply re-plans; only blocks they lock or move persist.
- **Fixed commitments are expressed as availability**: there's no separate
  "busy" calendar. Students describe when they're free (and can pin blocks);
  school hours and activities are whatever falls outside those windows.
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
