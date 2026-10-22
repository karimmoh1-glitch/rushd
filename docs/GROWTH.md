# Growth: the first 100 students

## Where things actually stand (October 22, 2026)

- Accounts: no real students yet beyond the founder's own test accounts.
- Measurement was rebuilt on October 22. Numbers before that date overcount:
  every page load counted, test accounts included, and background jobs looked
  like activity. Read /admin/growth from October 23 on.
- Not live until keys are added (see SETUP.md): the AI tutor, practice checks,
  draft feedback, video picks, email, Microsoft Teams. Until then the site says
  so plainly, and the app hides those features.
- What a student can use today: the free ranker and exam planner (no account),
  Canvas sync (token or calendar feed), the study plan, Pulse ranking, Today,
  study sessions, and streaks.

Everything below that has a number is a **target**, not a result.

## How we measure (all on /admin/growth)

| Stage | What counts | Where it comes from |
|---|---|---|
| Visitors | A browser on the homepage, once a day | Cookieless count; automation excluded |
| Planner starts | Someone typed in "Rank my week" (the demo doesn't count) | `#try-start` |
| Rankings | Someone pressed Rank it | `#try` |
| Saves | "Save my week" | `#try-save` |
| Sign-up starts | Sign-up page visitors | `/signup` |
| Sign-ups | Accounts created (test and staff excluded) | User table |
| First plan | Added work: typed it, imported it, or synced Canvas | setup events |
| First real study | Session, completed assignment, practice check, tutor message, draft review | study events |
| Day 1 / Day 7 | Active the day after signing up / in days 7–13 | Same events, per student |
| Weekly active | Added work or studied this week | Same events |
| Recurring | Active in 2+ of the last 4 weeks | Same events |
| Invites | Link visits, joins, invites that counted (friend studied 10+ real minutes) | `#ref-visit`, Referral table |

Page views and Rushd's own background jobs never count as activity.

## The 30-day plan

### Week 0 (before day 1): make the product whole

1. Add `ANTHROPIC_API_KEY` and `RESEND_API_KEY` (SETUP.md). The AI tutor and
   practice checks are what students tell friends about; email resets and the
   Sunday plan are what bring them back.
2. Make yourself an admin and check /admin/growth works.
3. Connect your own Canvas (token and calendar feed) and use Rushd for a week.
   Fix anything that annoys you before a student sees it.

### Days 1–7: one community, 20–30 students

Pick **one** school or student community where you can reach people directly:
your own school, a club, a class group chat, or a Discord server. Density
matters more than reach: classmates comparing plans is the loop.

Before inviting anyone, check their Canvas lets students create access tokens.
If not, the calendar feed works everywhere.

**Recruit:**
- Ask 5 friends to try it in front of you (in person or on a call). Watch where
  they get stuck. Don't explain anything.
- Post once in each group chat or club channel with a screen recording of Rank
  my homework on a real week (yours).
- Offer what it actually does: "It ranks everything you have due and plans
  your week around your free time. Free. Takes a minute."

**Onboard:** for the first 20, offer a 10-minute call to connect Canvas
together. Write down every question they ask; each one is a missing sentence
on the site.

### Days 8–14: five video experiments

One video every other day; 15–30 seconds; screen recording of the real
product with your voice. Never fake usage, never a fabricated testimonial,
never an AI-generated demo of things Rushd doesn't do. Track each with its own
invite link (Settings → Invite friends, once AI is on) or note the date and
watch homepage visitors that day.

| # | Hook (first 2 seconds) | What the video shows |
|---|---|---|
| 1 | "Canvas says I have 14 things due. Here's what I actually need to do tonight." | Paste the week into Rank my homework; the list reorders; tap the top item to see why. |
| 2 | "I stopped making to-do lists." | Canvas connected → Today shows Next up → start a session. |
| 3 | "Finals are in 6 weeks. This is my whole plan." | Plan my finals: tests in, a day-by-day schedule out. |
| 4 | "Why is this due-tomorrow worksheet ranked below a quiz on Friday?" | The Pulse breakdown: due date vs test-coming-up points. |
| 5 | "Day 12 of studying every day." | The streak on Today and the share card (only if it's a real streak). |

Keep the one with the most homepage visitors and rankings per view; make
three more variations of it.

### Days 15–21: feedback loop

- **Every Sunday, ask 5 active students** (not the same 5): "What did you use
  Rushd for this week? What almost made you stop?" Write answers down verbatim.
- **Every Monday, 15 minutes on /admin/growth.** Find the weakest step
  (biggest drop) and pick one change for the week.
- **Turning feedback into work:** a complaint heard from 3 different students
  becomes a task. Fix it, ship it, tell those 3 students it's fixed.
- **On day 14 for each student, ask:** "How would you feel if you could no
  longer use Rushd?" (very / somewhat / not disappointed). Record the share
  of "very".

### Days 22–30: from the first cohort to 100

- Ask every student with a 3+ day streak to share their invite link with two
  classmates.
- Add a second school or community only after the first has 15+ weekly active
  students.
- Late November and late April: push Plan my finals hard (videos 3 and 4).

## Targets and what we do if we miss them

| Metric | Target by day 30 | If below |
|---|---|---|
| Visitors → got a ranking | 25% | The hero isn't clear. Test a shorter headline and the demo playing sooner. |
| Got a ranking → sign-up | 10% | Saving isn't compelling. Test "Save my week" copy, show what Today looks like. |
| Sign-up → first plan | 70% | Onboarding is too long. Cut steps; make "type your week" the first screen. |
| Sign-up → first real study | 40% | Today doesn't make the next step obvious. Watch 3 students use it. |
| Day 7 active | 30% | Students aren't coming back. Prioritize the Sunday email and streaks; ask why. |
| "Very disappointed" on day 14 | 40%+ | Below 40%: stop recruiting and fix the product with the students you have. |
| Students | 30 sign-ups, 15 weekly active | Recruit in person before posting more videos. |

Day 60 target: 100 sign-ups, 40 recurring students, at one or two schools.
These are targets, not predictions.

## Rules

- Never invent users, counts, quotes, testimonials, or product-market-fit
  claims. Real quotes need the student's permission and first name only.
- Never claim a feature works until it's live (see the changelog).
- Don't email anyone who didn't opt in. Don't add students' schools to the
  site without permission.
- Paid creators, if any: they use the product for real and disclose (#ad).
