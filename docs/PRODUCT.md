# Rushd — Product

## What it is

Rushd (رُشد — guidance, sound judgment, being on the right path) is a free academic planning platform for high-school students. It turns classes, assignments, exams, and available study time into a single prioritized, adaptive plan.

## Thesis

Students don't need another chatbot. They need one place that knows what's due, what's overdue, what's worth how much of their time, and what to do *right now* — and that updates itself as reality changes.

## The one workflow the MVP is built around

Sign up → build academic profile → add classes → add assignments/exams → set study availability → Rushd generates a prioritized plan → student works the plan → plan adapts as work is completed, missed, or added.

Everything in the MVP exists to make this workflow excellent. Nothing else.

## MVP scope

In:
- Landing page, auth, onboarding
- Classes, Assignments, Exams (CRUD)
- Deterministic planning engine (scoring + scheduling into study windows)
- Dashboard ("what should I work on right now")
- Adaptive regeneration
- AI quick-add (optional, schema-validated, with deterministic fallback)
- Settings, feedback, minimal admin, privacy-conscious analytics

Explicitly out (see ROADMAP.md for when/whether):
- Social features, sharing, collaboration
- Calendar/LMS integrations (Canvas, Google Classroom)
- Native mobile apps
- Push/email notifications (schema supports it; delivery is not built)
- Generic AI chat
- Gamification/streaks beyond simple progress display

## Non-negotiable product principles

1. The planning engine is the product. AI supports it; AI is never the product.
2. Simplicity beats feature count.
3. Never fabricate metrics, testimonials, user counts, or partnerships — anywhere, including the landing page.
4. Every feature must trace back to the core workflow or it doesn't ship.
5. Privacy is a real constraint, not a policy page: collect only what the planning engine needs.

## Success signal

Not "does it look impressive." The bar: would a real high-school student open this daily instead of a spreadsheet + calendar, and would they recommend it to a friend? Analytics (plan_generated, plan_item_completed vs. plan_item_skipped, feedback) exist to answer that honestly.
