# Reading Rushd's metrics from real data

Every number in this document is a query, not a value. Rushd has no
analytics vendor: product events are rows in the `Event` table, public page
counts are rows in `PageView`, and the rest comes from the product tables
themselves. Run the queries against a **read-only connection** to production
(Neon console → SQL editor on the `main` branch, or `psql` with a read-only
role). Never quote a figure that wasn't produced this way, and say how many
students it's based on: with a few dozen accounts, a percentage is an
anecdote.

## Who counts

Exclude test and staff accounts everywhere (the same rule as
`isTestOrStaff` in `src/lib/analytics/events.ts` and the `REAL` filter in
`src/lib/analytics/funnel.ts`):

```sql
-- "real students"
u."isAdmin" = false
AND u.email NOT LIKE '%@example.com'
AND u.email NOT LIKE 'integration-test-%'
```

Deleted accounts take their events with them (cascade). Historical cohort
numbers can therefore go *down* after a student deletes their account; that
is expected, and the reason to record dated snapshots (below) when you
report a number externally.

## The events that exist today

Logged by `logEvent` (`src/lib/analytics/log-event.ts`), with counts and
ids only, never content.

| Area | Event names |
|---|---|
| Account | `signup` (props: `inviteCode`, `referred`), `onboarding_completed` (`classCount`, `availabilityWindowCount`), `data_exported` |
| Getting work in ("setup") | `assignment_created` (`via`), `exam_created`, `class_created`, `assignment_imported`, `assignment_confirmed`, `try_week_imported`, `canvas_connected`, `canvas_connect_failed` (`code`), `canvas_synced`, `canvas_feed_connected`, `canvas_disconnected`, `teams_connected`, `teams_synced`, `teams_disconnected`, `course_content_synced` |
| Planning | `plan_generated` (system: written on every plan change and by the cron, **not** activity), `plan_item_completed`, `plan_item_skipped` (`itemId`, `itemKind`), `schedule_block_pinned`, `schedule_block_moved`, `schedule_blocks_cleared`, `review_scheduled` |
| Studying ("study") | `study_session_started`, `study_session_completed` (`plannedMinutes`, `actualMinutes`, `elapsedMinutes`, `perceivedDifficulty`), `study_session_abandoned`, `assignment_completed`, `assessment_completed` (`items`, `confidence`, `source`), `assessment_unreadable`, `tutor_message` (`rounds`, `sources`, `refused`), `draft_reviewed` |
| Views | `dashboard_viewed`, `insights_viewed`, `profile_viewed`, `how_rushd_thinks_viewed`, `what_if_simulator_used` |
| Money | `checkout_started` (`plan`); the plan itself is in `Subscription` |
| Feedback | `feedback_submitted` (`context`); ratings and text are in `Feedback` |

Definitions shared with the admin pages (`src/lib/analytics/events.ts`):
**setup events** = getting work into Rushd; **study events** =
`study_session_completed`, `assignment_completed`, `assessment_completed`,
`tutor_message`, `draft_reviewed`; **active** = any setup or study event.
Views and `plan_generated` are never activity.

Public, anonymous page counts (`PageView`: day, path, count; no visitor
identity) cover the paths listed in `src/lib/analytics/page-view.ts`. They
count only on production (`VERCEL_ENV=production`) and are capped per IP.

## Where to look first: /admin/growth

`/admin/growth` (admin only) already shows, from the queries in
`src/lib/analytics/funnel.ts`: the 30-day funnel (visitors → planner starts →
signups → onboarded → first setup → first study), day-1 and day-7 activity
measured from each student's own signup, weekly signup cohorts, recurring
use, referrals, and paid plans. `/admin/ai` shows AI spend by feature. Use the
SQL below when you need a different window, a breakdown, or a number to put in
writing.

## Activation

```sql
-- Signup → onboarding → first work added → first real study action, for
-- students who signed up in the last 30 days.
WITH cohort AS (
  SELECT u.id, u."createdAt", u."onboardingCompletedAt"
  FROM "User" u
  WHERE u."createdAt" >= now() - interval '30 days'
    AND u."isAdmin" = false AND u.email NOT LIKE '%@example.com' AND u.email NOT LIKE 'integration-test-%'
),
firsts AS (
  SELECT c.id,
    MIN(e."createdAt") FILTER (WHERE e.name IN ('assignment_created','exam_created','assignment_confirmed','try_week_imported','canvas_synced','canvas_feed_connected','teams_synced')) AS first_setup,
    MIN(e."createdAt") FILTER (WHERE e.name IN ('study_session_completed','assignment_completed','assessment_completed','tutor_message','draft_reviewed')) AS first_study
  FROM cohort c LEFT JOIN "Event" e ON e."userId" = c.id
  GROUP BY c.id
)
SELECT
  COUNT(*)                                              AS signed_up,
  COUNT(*) FILTER (WHERE c."onboardingCompletedAt" IS NOT NULL) AS onboarded,
  COUNT(f.first_setup)                                  AS added_work,
  COUNT(f.first_study)                                  AS studied,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY f.first_study - c."createdAt")
    FILTER (WHERE f.first_study IS NOT NULL)            AS median_time_to_first_study
FROM cohort c JOIN firsts f ON f.id = c.id;
```

"Time to first useful study action" is `median_time_to_first_study`. Report
it with the `studied` count next to it.

## Retention

Weekly cohorts, active in each week after signup (the same "active"
definition as the admin page):

```sql
WITH cohort AS (
  SELECT u.id, date_trunc('week', u."createdAt") AS week, u."createdAt"
  FROM "User" u
  WHERE u."isAdmin" = false AND u.email NOT LIKE '%@example.com' AND u.email NOT LIKE 'integration-test-%'
    AND u."createdAt" >= now() - interval '12 weeks'
),
activity AS (
  SELECT DISTINCT c.id, c.week,
    floor(extract(epoch FROM e."createdAt" - c."createdAt") / 604800)::int AS week_n
  FROM cohort c JOIN "Event" e ON e."userId" = c.id
  WHERE e.name IN ('assignment_created','exam_created','assignment_confirmed','try_week_imported','canvas_synced','canvas_feed_connected','teams_synced',
                   'study_session_completed','assignment_completed','assessment_completed','tutor_message','draft_reviewed')
)
SELECT c.week::date AS cohort_week,
       COUNT(DISTINCT c.id) AS students,
       COUNT(DISTINCT a.id) FILTER (WHERE a.week_n = 1) AS active_week_1,
       COUNT(DISTINCT a.id) FILTER (WHERE a.week_n = 2) AS active_week_2,
       COUNT(DISTINCT a.id) FILTER (WHERE a.week_n = 4) AS active_week_4
FROM cohort c LEFT JOIN activity a ON a.id = c.id
GROUP BY 1 ORDER BY 1;
```

A cohort week whose students are younger than N weeks can't have an
`active_week_N` yet; leave those cells blank rather than reading them as zero.

## Outcomes (is Rushd helping?)

These are product signals, not proof of learning. Say so when you use them.

```sql
-- Work finished on time vs late, per month (all real students' assignments).
SELECT date_trunc('month', a."dueAt")::date AS month,
       COUNT(*) FILTER (WHERE a.status = 'COMPLETED' AND a."completedAt" <= a."dueAt") AS on_time,
       COUNT(*) FILTER (WHERE a.status = 'COMPLETED' AND a."completedAt" >  a."dueAt") AS late,
       COUNT(*) FILTER (WHERE a.status <> 'COMPLETED' AND a."dueAt" < now())         AS open_past_due
FROM "Assignment" a JOIN "User" u ON u.id = a."userId"
WHERE u."isAdmin" = false AND u.email NOT LIKE '%@example.com' AND u.email NOT LIKE 'integration-test-%'
GROUP BY 1 ORDER BY 1;

-- Study sessions: completion rate and planned vs actual minutes.
SELECT date_trunc('week', s."startedAt")::date AS week,
       COUNT(*) FILTER (WHERE s.status = 'COMPLETED') AS completed,
       COUNT(*) FILTER (WHERE s.status = 'ABANDONED') AS abandoned,
       SUM(s."actualMinutes") FILTER (WHERE s.status = 'COMPLETED') AS minutes_studied,
       round(avg(s."actualMinutes"::numeric / NULLIF(s."plannedMinutes", 0)) FILTER (WHERE s.status = 'COMPLETED'), 2) AS actual_over_planned
FROM "StudySession" s JOIN "User" u ON u.id = s."userId"
WHERE u."isAdmin" = false AND u.email NOT LIKE '%@example.com' AND u.email NOT LIKE 'integration-test-%'
GROUP BY 1 ORDER BY 1;

-- Following the plan: suggested items acted on vs skipped.
SELECT e.name, COUNT(*) AS n, COUNT(DISTINCT e."userId") AS students
FROM "Event" e JOIN "User" u ON u.id = e."userId"
WHERE e.name IN ('plan_item_completed', 'plan_item_skipped')
  AND e."createdAt" >= now() - interval '30 days'
  AND u."isAdmin" = false AND u.email NOT LIKE '%@example.com' AND u.email NOT LIKE 'integration-test-%'
GROUP BY 1;

-- Mastery evidence: topics with at least two pieces of evidence, and how the
-- latest score compares to the first. Small samples; low-confidence by design.
WITH ev AS (
  SELECT m."userId", m."topicKey", m.score, m."createdAt",
         row_number() OVER (PARTITION BY m."userId", m."topicKey" ORDER BY m."createdAt")      AS first_n,
         row_number() OVER (PARTITION BY m."userId", m."topicKey" ORDER BY m."createdAt" DESC) AS last_n,
         count(*)     OVER (PARTITION BY m."userId", m."topicKey")                              AS pieces
  FROM "MasteryEvidence" m
)
SELECT COUNT(*) AS topics_with_repeat_evidence,
       COUNT(*) FILTER (WHERE l.score > f.score) AS improved,
       COUNT(*) FILTER (WHERE l.score < f.score) AS declined
FROM ev f JOIN ev l ON l."userId" = f."userId" AND l."topicKey" = f."topicKey" AND l.last_n = 1
WHERE f.first_n = 1 AND f.pieces >= 2;

-- Feedback on recommendations and features.
SELECT context, COUNT(*) AS responses, round(avg(rating), 2) AS avg_rating
FROM "Feedback" GROUP BY 1 ORDER BY 2 DESC;
```

## Cost

```sql
-- AI spend by feature this month (settled cost; reservations still open count their estimate).
SELECT feature, status, COUNT(*) AS requests,
       round(SUM(COALESCE("costMicros", CASE WHEN status = 'reserved' THEN "estimatedCostMicros" ELSE 0 END)) / 1e6, 2) AS usd
FROM "AiUsage" WHERE "createdAt" >= date_trunc('month', now())
GROUP BY 1, 2 ORDER BY 1, 2;
```

Reconcile with the Anthropic invoice monthly; `src/lib/ai/pricing.ts` uses
list prices.

## Adding a metric

1. Log the event where the action succeeds: `await logEvent(user.id, "thing_done", { count })`.
   Properties are counts, ids and enums only; never text the student typed,
   file names, URLs with tokens, or grades.
2. If it's a real study or setup action, add it to `STUDY_EVENTS`
   (`src/lib/streak/streak.ts`) or `SETUP_EVENTS`
   (`src/lib/analytics/events.ts`) so activity and retention pick it up.
3. Add it to the table above.

## Reporting numbers outside the team

Write the query, the date it was run, and the number of students next to
every figure; keep the query in this file or the pitch notes. Until the
pilot has enough students to say something, report counts ("9 of 14
students finished a study session in their first week"), not rates.
