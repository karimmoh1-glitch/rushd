# Growth plan: 10,000 recurring students in 12 months

**Recurring** means active in at least 2 of the last 4 weeks. It is the first
number on /admin/growth. Week-over-week return rate ("came back") sits next to
it. That return rate is the number to watch: Duolingo grew daily users about
4.5x in four years mostly by improving how many current users came back.

Rough math: 10,000 recurring students at a 40% recurring rate means about
25,000 sign-ups in a year, around 70 a day by the end. That doesn't come from
the website alone. It comes from loops that bring students in, plus retention
that keeps them.

## What's built (in the product today)

| Lever | Where | Funnel signal |
|---|---|---|
| Instant value, no sign-up: the hero ranks a typed week | `/`, `RankMyWeek` | "Ranked a week", "Saved a ranked week" on /admin/growth |
| Saved week carried into the new account | onboarding finish screen + Today | "Added the week they ranked" |
| Free SEO tools | `/tools/rank-my-week`, `/tools/exam-study-planner` | page counts |
| Shareable rankings (the list lives in the link hash) | "Share this ranking" | `#try-share` count |
| Two-sided invites: +10 tutor messages a month each | Settings → Invite friends, `/r/<code>` | Referral rows |
| Streak share cards that double as invites | Today → Share, `/s/<token>` | Referral rows |
| Study streak with rest days | Today header | "Came back" |
| Sunday "your week" email + evening streak nudge | cron + Resend | "Came back" |
| Daily re-sync of Canvas, Teams, calendar feeds | cron | plans stay current without a visit |
| Calendar-feed fallback for schools that block Canvas tokens | `/integrations/canvas-calendar` | — |
| New-student "Start here": type the week on Today | Today | "First meaningful action" |
| Hitting the tutor limit points to invites | tutor | — |

## What only you can do (highest leverage first)

1. **Turn on the keys** (docs/SETUP.md): Anthropic (the AI study agent is
   the product; without it the tutor, quizzes and photo checks are off),
   Resend (email: retention and password resets), then YouTube, Stripe, and
   Microsoft.
2. **Short-form video, weekly.** The proven student channel. Hook: a
   10-second screen recording, "Canvas shows 14 things due. Here's what I
   actually need to do tonight," then the Rank my homework tool. Post from a
   Rushd account and your own. If you pay creators: flat fee, real use of the
   product, and a clear #ad every time. Don't frame it as "does your homework."
   That's false and it's the criticism photo-solver apps get.
3. **One school at a time.** Pick 2–3 schools whose students can connect
   (Canvas tokens on, or the calendar feed). Get 10 students at one school
   using it weekly before the next. Density makes word of mouth work.
   /schools already takes inquiries.
4. **Campus ambassadors** at those schools: free Pro, a small stipend, and they
   disclose the relationship. They run a "plan your finals" session using
   /tools/exam-study-planner in late November and late April.
5. **Finals pushes.** Exam season is when students look for help. Push Plan my
   finals in the last two weeks of November and April.
6. **Search Console + the sitemap** (SETUP.md step 5). The two tools and the
   homepage are built to rank for "assignment prioritizer," "homework
   planner," and "finals study schedule."
7. **Real social proof, as it appears.** Ask early students for a one-line
   quote with first name and school, with permission. Add it only once it's
   real. Never invent users, counts, or quotes.
8. **A day-14 question** to early students: "How would you feel if you could
   no longer use Rushd?" If fewer than 40% say "very disappointed," fix the
   product before spending on growth.

## Weekly review (15 minutes, Mondays)

/admin/growth: recurring students, came-back %, the try-it funnel
(visits → ranked → saved → signed up → added), invites joined/studied. Pick
the weakest step and change one thing.
