# Visual pass (October 22, 2026)

Branch `premium-visual`, built on `course-details-slice`. Not deployed. It
reads the course-details columns, so it ships only after that slice's
migration (`20261023090000_course_details`) is applied.

## The five biggest problems, and what changed

| Problem | Change |
| --- | --- |
| Flat, same-tone surfaces with no depth | Layered dark surfaces (sidebar < page < card < popover), stronger borders, card and popover shadows, saffron focus ring |
| Courses had no identity: identical rows, a "—" placeholder, a one-sentence course page | Tiles with a course-color rule, level/code/school, term progress ("Week 9 of 17"), weekly goal; a course page with a tinted header, Edit course, next due, open work, study time, and the course's own deadlines |
| Today was a flat stack of sections | A course-tinted Next up with a saffron Start session; two columns: Today and Coming up on the left; This week and Your courses on the right |
| Color carried no meaning | Status tokens and chips: overdue, today, soon, upcoming. Words carry the meaning; color only reinforces it |
| Phone rough edges | Dialogs are bottom sheets, controls are 36px, safe-area-aware header and tab bar, session bar sits under the header |

## Real data only

- Your courses (Today) and Studied, last 7 days (course page) add up minutes
  from completed study sessions linked to that course's assignments and
  exams (`src/lib/courses/study-time.ts`). Goals come from the student's
  own `weeklyHours`. A course with neither study time nor a goal isn't shown.
- Term progress comes from the course's term dates, in the student's time
  zone (`src/lib/courses/term.ts`).
- This week shows planned minutes over the time actually available each day,
  with overloaded days marked, and names the busiest day.
- The landing page's trust section restates the privacy policy's commitments
  and nothing beyond them. It has no testimonials or metrics.

## Motion

Motion uses transform and opacity only, plus a stroke draw on two small SVGs.
It uses strong ease-out curves, and UI motion stays under 300ms.

- **Loading:** `BrandLoader`. The three dots of the shīn settle onto the
  rising path and the saffron node lights. It stays invisible for 350ms, so
  fast loads never flash it, and it is used only where a real route load
  happens (course pages). Under reduced motion it's a still mark with a
  breathing node.
- **Pages:** a 220ms, 4px rise on navigation.
- **Buttons:** pressed buttons scale to 0.97.
- **Dialogs:** they enter faster than they leave.
- **Session finished:** the path draws to its end and the node lights.

Everything sits behind `prefers-reduced-motion: no-preference`.

## Checks

- **Lint and types:** `npm run lint` and `npx tsc --noEmit` are clean.
- **Unit:** 298 tests pass, including new tests for dueStatus,
  studyTimeByCourse and termProgress.
- **Integration (local DB):** 80 tests pass.
- **e2e (local DB):** all functional specs pass.
- **Accessibility:** new `e2e/a11y-screens.spec.ts` runs axe (WCAG 2 A/AA)
  on home, Today, Courses, Assignments and a course page, in light and
  dark. It caught and fixed the light Soon chip contrast.
- **Visual baselines:** re-baselined on purpose (see the commit message).
  No visible text was removed from any structure snapshot.
- **Production build:** succeeds. No dependencies were added.
- **Design tour:** `TOUR=1 TOUR_OUT=dir [TOUR_THEME=light] npx playwright test e2e/tour.spec.ts`
  builds a student through the real UI and screenshots every main screen
  on desktop and phone.

## Found along the way

- A root `(app)/loading.tsx` left an orphaned hidden copy of each streamed
  page in the DOM (Next 16 dev). It was removed; route-level loaders don't
  do this.
- The session clock was rendered on both server and client, which caused a
  hydration mismatch on every page with a running session. Fixed.

## Still inconsistent

- Plan, Mastery, Tutor, Practice and Settings use the new tokens, but their
  layouts weren't redesigned.
- Course tiles with little data leave empty space when a neighboring tile in
  the row is taller.
- Disabled saffron buttons (Start while another session runs) look muddy;
  they need a dedicated disabled style.
- Phone screenshots come from a 390px browser, not a device. Rushd is still
  a responsive website; there is no native iOS app (see `docs/IOS.md`).

# Page polish (October 23, 2026)

Branch `page-polish`, built on `platform`. Brings the pages outside Today,
Courses and the course page up to the same system. No schema changes, no new
dependencies, no new animation.

## What changed

| Area | Change |
| --- | --- |
| Assignments, Exams | Course-color rule and course name on each row, StatusChip with the due date in its own column, Pulse, Start. A shared header with underline tabs and a one-line summary of what's open. On phones the status line moves under the title instead of cutting off the date. Empty states use PathEmpty with real next actions. |
| Assignment detail | Back link, course link in its color, StatusChip with the due date, sections on cards. The rubric is a list on phones so the Points column is never cut off. |
| Practice, Progress | Shared panels and stat tiles (src/components/page-section.tsx). Verdict chips carry words plus status colors. Without AI, Practice points to course practice, which works without it. |
| Settings | A section index (sticky list on wide screens, chips on phones); every section on a panel; one row pattern for integrations, sign-out-everywhere and Download my data; the danger zone on its own destructive-toned panel. Existing anchors kept. |
| More, Profile, integrations, Upgrade, Admin | More is grouped and reaches Mastery, Progress, Academic profile, Integrations and How Rushd plans. Profile fixes "Your's". Canvas, calendar feed and Teams go back to Settings the same way and share one layout. Admin no longer widens the page at 390px. |
| Auth | Brand column on wide screens (رُشد, what the name means, the three things the landing says Rushd does); 44px fields on phones; show/hide password that keeps ids, names and autocomplete. |
| Public pages | One title style (the landing's display style) on every page; Contact lists the real ways to reach Rushd. |
| Course tiles | Every active tile has a term line (or an Add term dates shortcut) and a Next due box, so tiles in a row line up. |
| Signal buttons | A real disabled style (muted surface and text) instead of half-transparent saffron; a blocked Start keeps pointer events so its title explains why. |

## Checks added

- `e2e/layout-390.spec.ts`: no page this pass touched is wider than a 390px
  screen, with seeded real-looking data (long titles and emails, a rubric).
- `e2e/a11y-screens.spec.ts` now covers every page above, light and dark.
- `e2e/pages-tour.spec.ts`: on-demand screenshots of these pages
  (`TOUR=1 TOUR_OUT=dir [TOUR_THEME=light]`).

## Still open (outside this branch's scope)

- Today (`/dashboard`) is wider than the screen at 390px when the Today panel
  has a scheduled block with a long title (up to ~280px of sideways scroll in our check; likely a grid column without `min-w-0`, so `truncate` never kicks in). Today's files belong
  to another workstream, so it isn't fixed here.
- `struct-plan` in the visual check depends on the current date and fails on
  days other than the one it was recorded on.
