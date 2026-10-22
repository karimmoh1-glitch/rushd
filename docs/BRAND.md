# Rushd brand system

## Idea

**Clarity emerging from complexity.** Scattered points settle onto one path,
and the path ends in a single lit node: the next step. Everything in the
identity comes from that picture.

## Logo

- **Mark** (`src/components/brand/rushd-mark.tsx`): three points on a rising
  path ending in a saffron node. The three points are the three dots of the
  shīn (ش) in رُشد; on a first visit they start in the shīn's triangle and
  settle onto the path.
- **Lockup** (`RushdLogo`): mark + "Rushd" in Newsreader + hairline + رُشد in
  Amiri Bold. Use the full lockup in headers and footers.
- Favicon and app icon: the mark on ink (`src/app/icon.svg`, `apple-icon.tsx`).
  The desktop app icon in `desktop/` is still the old placeholder; regenerate it
  with the mark before the next desktop release.

## Color (tokens in `src/app/globals.css`)

| Role | Token | Use |
|---|---|---|
| Paper | `--background`, `--card` | Surfaces |
| Ink | `--foreground`, `--primary` | Text, structure, primary buttons |
| Slate | `--muted-foreground` | Secondary text |
| **Saffron** | `--signal` | The signature. The lit node, the next step, "needs review". Fill only, never body text |
| Saffron text | `--signal-ink` | Labels in the saffron family (e.g. "NEXT STEP") |
| Teal | `--teal` | Quiet complement: strong mastery, success |
| Brick | `--destructive` | Errors only |

Mastery: `needs_review` = saffron, `developing` = ink at 55%, `strong` = teal.
Saffron appears once per view where possible; if everything is lit, nothing is.

## Type

- Display: **Newsreader** (`font-display`), weight 500, for page titles (all
  `h1`) and marketing section headings. Italic for the one emphasized word.
- UI and body: **Geist**. Section headings in the app stay sans, semibold.
- Numbers and metadata: **Geist Mono**, tabular.
- Arabic: **Amiri** Bold, logotype only.

## Shape

Buttons are pills. Fields are 8px. Cards and panels are 12px (16px for hero
panels). Prefer dividers and spacing over nested cards.

## Motif components

- `PathLoader`: points drift into line, last one lights. Loading and AI waits.
- `PathEmpty`: scattered points with one lit node. Empty states.
- `BrokenPath`: a path that breaks before its node. Errors and 404.
- Onboarding progress is the path: done points ink, current point lit.
- The sidebar's active item carries a small saffron node.

## Motion

| Name | Curve / timing | Where |
|---|---|---|
| settle | `--ease-settle`, ~900ms, 60–70ms stagger | Points finding their place |
| rise | ~650ms, short translate + fade | Copy entering |
| draw | ~400–700ms | Path segments drawing |
| light | ~600ms scale + one soft ring | The saffron node coming on |

- **Brand intro** (homepage, first visit per session, ~1.5s): the logo's shīn
  dots settle, headline lines rise, the agent path draws, the final node lights.
  Content is fully visible without it; it never replays on navigation.
- **Signature scroll moment** (`SignatureLoop`): a week of scattered coursework
  settles onto the path in priority order when the section enters view; the
  top item lights as the next step. Triggered once, no scroll-jacking.
- **Living detail**: on the hero's agent path a light travels the path and each
  point glows as it passes.
- Scroll-driven reveals (`reveal-rise`, `reveal-stagger`, `reveal-draw-x`) are
  progressive enhancements via CSS `animation-timeline`.
- `prefers-reduced-motion`: every animation collapses; loops stop; the
  signature moment shows its final state.
