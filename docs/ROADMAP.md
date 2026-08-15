# Rushd — Roadmap

## Now (this build): MVP

Landing → auth → onboarding → classes/assignments/exams → deterministic planning engine → dashboard → adaptive regeneration → AI quick-add with fallback → settings/feedback/admin → tests → deploy-ready.

## Next (post-MVP, ordered by expected leverage)

1. **Notification delivery** — schema already models `Notification`; wire up email (or web push) for "your plan changed" / "exam in 3 days and you haven't started."
2. **Recurring assignments/classes** — weekly problem sets, recurring quizzes, without re-entering them each week.
3. **Calendar export (ICS)** — one-way export of the plan into whatever calendar the student already uses; cheaper than building a calendar UI.
4. **Multi-week/semester view** — currently the dashboard is "today"-centric; add a zoomed-out view for exam-heavy weeks.
5. **Parent/counselor read-only view** — opt-in, student-controlled; useful for the "credible to a counselor" bar without building a second product.
6. **Study session tracking (actual vs. estimated effort)** — feed real completion times back into the scoring model's effort estimates per student.
7. **Google Classroom / Canvas import** — reduces manual entry, the single biggest predictable drop-off point.
8. **OAuth login** (Google) — schema already supports it via Auth.js `Account` model; add when signup friction data justifies it.
9. **Mobile app or PWA install** — responsive web first; revisit once there's usage data showing mobile session patterns.
10. **Smarter AI subtask breakdown** — decompose large assignments into subtasks automatically, still behind the same "never silently mutate data, always show before commit" rule.

## Explicitly not planned

- Generic AI chat interface
- Gamification (streaks, badges, leaderboards) — contradicts the "calm, academic, trustworthy" design direction unless usage data specifically shows it helps
- Social/sharing features between students
