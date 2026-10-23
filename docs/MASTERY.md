# Mastery, review and practice: how Rushd estimates what a student knows

This is the model behind the Topics, Practice, Mistakes and Mastery screens.
It is a set of transparent rules over the student's own answers, not a
validated psychometric model. Treat every number as a rough estimate with a
stated confidence, never as a grade or a prediction of exam results.

Code: `src/lib/learning/` (pure: `estimator.ts`, `review.ts`, `graph.ts`,
`subjects.ts`, `observations.ts`; database: `topics.ts`, `practice.ts`,
`load.ts`). Unit tests sit next to the pure files; the services are covered by
`learning.integration.test.ts` against a real database.

## Data

- **CourseTopic**: a student's topic map per course. Optional parent (one level
  of subtopics), order, `source` (`STUDENT`, `SYLLABUS`, `TEMPLATE`,
  `AI_SUGGESTED`) and `status` (`CONFIRMED`, `PROPOSED`). Proposed topics are
  never used for mastery or review until the student confirms them.
- **TopicPrerequisite**: "learn B before A", same student and course, no cycles
  (checked on every insert).
- **MasteryEvidence**: one row per piece of evidence. Photo checks write one row
  standing for several answers (`weight` = gradable items). Practice writes one
  row per answer with `result` (correct / partial / incorrect), `difficulty`
  (1-3), `hintsUsed`, optional self-reported `confidence` (1-3, asked before the
  answer is shown), `sessionId`, `questionId`, `timeTakenSec`, `isReview`, and
  what the student wrote. Evidence recorded before a topic existed is linked to
  it by topic key (same course, or no course) when the topic is created or
  confirmed.
- **PracticeQuestion / PracticeSession / QuestionReport**: the student's own
  questions ("your question"), AI-generated ones (always labeled "AI-generated ·
  unverified", with what they were grounded in), sessions, and problem reports.

## The estimate (per topic)

Inputs are observations: when, credit (correct 1, partial 0.5, incorrect 0, or a
photo check's overall score), how many answers it stands for, difficulty,
hints, confidence, session, question.

1. **Accuracy** is a weighted mean of credit. Weights: difficulty (easier 0.75,
   standard 1, harder 1.25) times recency (half-life 30 days). Hints reduce
   credit (1 hint ×0.8, 2 ×0.6, 3+ ×0.4).
2. **Occasions**: sessions that start within 20 hours of each other are one
   occasion. Answers within one occasion add evidence with diminishing returns
   (1, 2, 4, 8 answers ≈ 1, 2, 3, 4 units). This is how "massed repetition"
   counts less than success on separate days.
3. **Clean recall** is a correct answer with at most one hint (or a photo check
   at 80%+). An occasion is a success when its accuracy is at least 80% and it
   includes a clean recall.
4. **Review schedule** (expanding intervals): 1, 3, 7, 14, 30, 60, 120 days. The
   first success sets 1 day. A later success moves one step up only if it came
   at least half the current interval after the previous success (otherwise
   it was massed, and the interval stays). An occasion under 50% accuracy drops
   two steps (failures shorten the interval). The next review is the end of the
   last occasion plus the current interval. A topic is **due** once that time
   passes.
5. **Status**
   - *Not enough evidence*: under 2 units of evidence (for example one answer).
   - *Needs review*: accuracy under 60%; or 3+ misses in the last 5 answers; or
     a repeated miss on the same question that was also the latest answer; or
     overdue by at least the current interval (at least 2 days): it may be
     slipping.
   - *Secure*: accuracy at least 80%, at least **two separate successful
     occasions**, at least 3 units of evidence, not due, and the latest answer
     wasn't a miss. One correct answer, or any number of answers in one
     sitting, can never be secure.
   - *Developing*: everything else.
6. **Confidence in the estimate**: low with under 3 units or a single occasion;
   high with 6+ units over 3+ occasions; medium otherwise. It drops a level when
   the latest evidence is more than 60 days old.
7. **Range**: ±0.5/√(units+1), widened by up to 10 points as evidence ages past
   30 days. No range is shown while the status is "not enough evidence".
8. **Calibration**: two or more "sure" answers that were wrong (at least a third
   of the "sure" answers) flags overconfidence; three or more "unsure" answers
   that were right without hints (at least three quarters) flags
   underconfidence.
9. **Explanation**: one sentence built from the same numbers, for example
   "3 of 3 answers correct across 2 sessions, last correct 9 days ago; one more
   correct answer next week would confirm it", plus what evidence would improve
   the estimate.

The estimator is pure and deterministic: the same evidence and the same "now"
always give the same result (see `estimator.test.ts`).

## Review queue

`reviewQueue(candidates, now, { horizonDays, limit })` in `review.ts` returns
due topics, most urgent first (days overdue relative to the interval, then
needs-review before developing, then lower estimates), each with a reason and a
suggested length (20 minutes for needs-review, 10 otherwise). It's pure so the
planner can call it with the same inputs. `getLearningOverview()` and
`getCourseLearning()` in `load.ts` build the inputs from the database.

## Prerequisite remediation

When a topic needs review, or is developing under 70%, `recommendRemediation()`
walks its prerequisites (breadth-first, up to four levels back) and recommends
the weakest one that isn't secure: needs-review first, then never-practiced,
then developing; lower estimates and closer prerequisites break ties. If every
prerequisite is secure it says the gap is probably in the topic itself.

## Practice and subjects

Practice never needs AI. Students write their own questions (question, answer,
optional hint and explanation, difficulty), then run sessions: try the
question, optionally say how sure they are, take hints one at a time, reveal
the answer, and mark themselves correct, partly, or missed. Each answer becomes
evidence; misses go to the course's mistake history with what the student
wrote, and can be retried.

With an AI key, students can generate questions for a topic. Generation goes
through `AIProvider.generatePracticeQuestions` (validated with zod, metered as
`practice_questions`, daily and cost limits), is grounded in the course's topic
list and any matching course materials, and every item is labeled as
AI-generated and unverified, never as an official exam question. "Report a
problem" records a report and hides the question for that student.

`subjects.ts` maps a course's subject and name to a family: math and science
(worked problems with steps), humanities and social sciences (short answers
and explanations), languages (vocabulary and translation prompts), computer
science (code and trace questions). Anything else uses a general workflow, and
the practice page says so.

## Tutor evidence

The tutor can ask a question from the student's practice bank as a "check"
(a one-question practice session). Its answer counts like a practice answer,
with `source = "tutor"`, only when the student answers in a later message and
the tutor marks it correct, partly right or incorrect against the question's
stored answer. Hints taken on a check reduce credit as usual. Unlike practice,
the mark is the tutor's judgment rather than the student's own; treat it like
photo-check evidence (an AI judgment) when validating. Conversation alone never
changes a mastery estimate. See docs/AI_ARCHITECTURE.md (course-aware tutoring).

## Events

Counts and statuses only, never content: `practice_session_started`
(questions, mode), `practice_session_completed` (attempted, correct, partial,
incorrect), `topic_mastery_changed` (from, to), `review_completed` (topics),
`question_reported` (reason), `practice_questions_generated` (count, grounded).

## Limits (read before trusting a number)

- Students mark their own answers. Self-marking is optimistic for some
  students and harsh for others; calibration flags only catch the extremes.
- The thresholds (60%, 80%, two occasions, the interval ladder, the 30-day
  half-life, the hint penalties) are reasoned defaults, not fitted to data.
  They need checking against real students' later results.
- Photo checks are AI judgments of a short sample, folded in as one occasion.
- Topic maps are whatever the student (or a confirmed import) says. A wrong or
  missing prerequisite edge gives a wrong remediation hint.
- The estimate knows nothing about the course's grading, exam format or
  difficulty relative to other schools.
- Time decay uses the review schedule, not a memory model fitted to the
  student.

## What to validate with real students

- Do "secure" topics stay correct when checked a week or a month later?
- Do review reminders at these intervals catch forgetting, or are they too
  early or too late for most students?
- How often do self-marks disagree with a teacher's marking of the same answer?
- Do students act on prerequisite recommendations, and does that help?
- Are generated questions correct often enough? Track report rates per topic
  and subject family.
