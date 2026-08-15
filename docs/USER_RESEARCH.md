# Rushd — User Research Log

Karim is the founder, primary user, and primary researcher (`docs/PRODUCT.md`).
This is a running log, not a one-time document — add an entry after every
real testing session, not just when something breaks.

Real usage beats synthetic test data. A friction point Karim hits doing his
actual homework is worth more than ten hypothetical personas.

## How to use this

After using Rushd for real (your own classes, or watching a friend try it):

1. Add a dated entry below.
2. Note what you were trying to do, not just what broke.
3. Distinguish "this is annoying" from "this is why I'd stop using it" —
   both matter, but they're different priorities.
4. Link the resulting fix's commit if/when one lands.

When a few friends start testing, add a short section per person rather
than merging everyone's feedback into one undifferentiated list — patterns
across different students are more informative than a single loud opinion.

## Founder testing log

### Template for new entries

```
### YYYY-MM-DD — [what you were doing]

Context: [which classes/assignments, what you were trying to accomplish]

What worked:
-

What didn't:
-

Would I recommend this to a friend right now? [yes/no/not yet, why]

Fixed in: [commit hash, or "not yet" / "not planned — reasoning"]
```

### 2026-08-15 — Initial build, synthetic testing only

Context: No real academic data yet — the MVP was built and verified with
seeded test data (Chemistry/History assignments, a test exam) and one
scripted Playwright run, not real daily usage.

This entry exists to mark the boundary honestly: everything before the
first real dated entry below is engineering verification, not user
research. Don't let synthetic-data confidence substitute for actually
using the product for a week of real homework.

**Next step**: use Rushd for your actual current classes for at least a
week before making any more planning-algorithm changes based on
intuition alone.

## Testing protocol (5-10 real students)

The goal is to measure what students actually do, not what they say they'd
do. Opinions ("I like this") are the least reliable signal available;
behavior (did they come back, did they act on the plan, did they lie to the
tool by marking things complete without doing them) is the most reliable.
Every session below should produce data, not just impressions.

### Who

5-10 students, recruited from Karim's actual school network first (real
classes, real deadlines, real stakes — not a synthetic scenario). Prioritize
variance that matters to Rushd's core assumptions: at least one student
carrying a heavy AP/honors load (tests the overdue/exam-proximity scoring
under real pressure), at least one with a lighter load (tests whether the
plan still feels useful when nothing is urgent), and a mix of organizational
habits (some already use a planner/calendar, some use nothing).

### Setup

1. Get the student to sign up and complete onboarding with their **real**
   classes and **real** current assignments/exams — not a demo scenario.
   Set real study availability, not an idealized one.
   [Signup security posture: see `docs/SECURITY.md`; this is a real account
   creation with a real password, not a test fixture.]
2. Do not walk them through the UI. Watch where they get stuck. The plan
   only matters if it's usable without a guided tour.
3. Ask them to use Rushd as their actual planning tool for at least one full
   week (ideally through at least one real due date and, if timing allows,
   one real exam) before the debrief.

### What to instrument (ties to the Product Metrics section below)

For each student, pull their `Event` rows (`plan_generated`,
`plan_item_completed`, `plan_item_skipped`, `assignment_completed`,
`feedback_submitted`, etc. — see `docs/PRODUCT.md#analytics`) rather than
relying on memory or self-report at the debrief. Specifically look at:

- **Did they open the plan on multiple distinct days**, not just once at
  signup? (Activation → Retention signal.)
- **Completed vs. skipped ratio** on plan items — a student who skips
  almost everything is telling you the plan isn't matching their real
  priorities, regardless of what they say in the interview.
- **Time between `plan_generated` events** — is the plan actually changing
  in response to their real activity, or does it look static?
- **Did they ever open Settings to adjust availability** after the first
  setup — a sign the initial plan felt wrong in a fixable way (good) vs.
  them just tolerating a bad fit (bad, and won't show up unless you ask).

### What to ask (after observing, not before)

Behavior-first, opinion-second — ask what happened before asking how they
felt about it:

1. "Walk me through the last time you opened Rushd — what were you trying
   to do?" (not "what do you think of the dashboard")
2. "Show me an assignment you marked complete — did you actually do the
   work in the session Rushd suggested, before, after, or not at all?"
   (This is the single most important question for validating the planning
   engine's real-world accuracy — see `docs/PLANNING_ENGINE.md`'s "no
   partial-completion tracking" limitation.)
3. "Was there ever a day where Rushd told you to do something that felt
   wrong?" — then dig into *why*: wrong priority, wrong time estimate,
   wrong day, or something Rushd simply didn't know about (a real signal
   for a missing input, not a scoring bug).
4. "Did you keep using it, or did you go back to whatever you used before?"
   — if they stopped, find out on which day and why; that day matters more
   than the aggregate impression.
5. Only at the end: "Would you tell a friend to use this?" Recorded as a
   yes/no/not-yet plus the one-sentence reason, not a rating.

### Recording results

One dated entry per student per week using the template above, kept
separate per person (not merged into a single list — see the note at the
top of this file). After 5+ students, look across entries for *patterns*
(e.g., "three students didn't trust the overdue bonus enough to act on it
first") rather than treating any single loud opinion as representative.
