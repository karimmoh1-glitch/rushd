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
