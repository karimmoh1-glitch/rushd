# Rushd — AI Architecture

AI is a supporting capability, never the product (`docs/PRODUCT.md`). This
doc covers how AI is wired in so no single feature — or provider — can take
the whole app down, and so output is never trusted blindly.

## Provider abstraction

`src/lib/ai/provider.ts` defines the interface every AI-backed feature calls
through, rather than importing the Anthropic SDK directly:

```ts
interface AIProvider {
  parseAssignmentImage(input): Promise<ExtractedAssignment[] | null>;
  parseQuickAdd(text, classes, now): Promise<QuickAddDraft | null>;
  // analyzeAssignment, estimateWorkload, tutor, explainConcept: Phase 4+,
  // added to the interface when the features that need them are built —
  // not stubbed out ahead of time.
}
```

`src/lib/ai/anthropic-provider.ts` is the current (only) implementation.
Swapping providers later means writing a new file that implements the same
interface, not touching every call site.

Every method returns `null` on any failure — missing API key, network
error, timeout, malformed response, schema validation failure — rather
than throwing. Callers always have a deterministic path forward:

| Feature | AI path | Fallback |
|---|---|---|
| Quick-add | Haiku, tool-calling for structured output | Regex-based parser (`src/lib/ai/fallback-parse.ts`) — always succeeds |
| Screenshot import | Vision model, tool-calling, structured extraction | No deterministic OCR fallback exists; the app falls back to *manual entry* (the existing Assignment dialog), not a broken feature |

## Validation

Every AI response — regardless of provider — is parsed through the same
Zod schema the deterministic fallback's output is also required to satisfy
(`src/lib/ai/schemas.ts`). AI output is structurally impossible to trust
more than user input: it goes through identical validation, and every
downstream write (e.g. `classId`) is re-verified for ownership server-side
independent of what the model suggested. See `docs/SECURITY.md`.

## Timeouts and retries

The Anthropic SDK's default request timeout applies; there is no custom
retry loop. A single failed attempt falls through to the deterministic
path immediately rather than retrying and making the student wait longer
for a feature that has a working fallback anyway. This is a deliberate
simplicity choice for MVP scale — revisit if failure rates in production
usage suggest retries would meaningfully help.

## Prompt injection

Two things a student can influence — quick-add text and an uploaded image —
are ever sent as untrusted content to the model, always as the `user`
message, never concatenated into the `system` prompt. The system prompt
(the class list, today's date, the extraction schema) comes entirely from
server-side data. Even a successful injection that manipulates the model's
*output* can't cause a harmful *write*, because:

- structured output is schema-validated before use
- a suggested `classId` is re-verified against the actual authenticated
  user's classes before any assignment/exam is created (`assertOwnsClass`)
- the model is never given tool access to anything beyond returning a
  structured object — no function calls that touch the database directly

## Cost and rate limiting

No per-user AI rate limit exists yet beyond the general auth rate limiter.
At current (near-zero) usage this is fine; before wider release, add a
per-user daily cap on AI-backed actions (quick-add parses, screenshot
imports) — cheap to add, not needed until there's real usage to protect
against. Tracked in `docs/ROADMAP.md`.

## Image uploads (screenshot import)

Uploaded screenshots are **never persisted** — not to disk, not to the
database, not to any object storage. The image is base64-encoded in memory
for the duration of a single server action call, sent to the vision model,
and discarded once extraction returns. This sidesteps file storage
architecture (signed URLs, cleanup jobs, access controls) entirely for
MVP and is the more privacy-respecting default — see `docs/PRIVACY.md`.
Revisit only if a real feature need emerges for showing a student their
original upload later (e.g. re-checking an extraction against the source
image), which nothing in the MVP requires.

Upload constraints enforced server-side (never trust the client or a file
extension): MIME type allowlist (`image/png`, `image/jpeg`, `image/webp`),
8MB size cap, single request handles up to 5 images.

## Course content, tutor, and draft feedback (Rushd 2.0, phases A–B)

### Course content mirror (read-only)
`src/lib/canvas/content-sync.ts` mirrors, per linked course and on demand
(the "Sync course content" button on a class page): modules and module items
in order (`/courses/:id/modules?include[]=items`, falling back to
`/modules/:id/items` when Canvas omits items), published pages with bodies
(`/courses/:id/pages?include[]=body`), assignment descriptions and rubrics
(the `rubric` array on `/courses/:id/assignments`), and announcements from the
last 120 days (`/announcements?context_codes[]=course_:id`). Every request goes
through the same SSRF-guarded GET client as the assignment sync; Rushd never
writes to Canvas. A course that hides Pages/Modules/Announcements from students
(403/404) is recorded as a note, not a failure. HTML becomes plain text
(`htmlToText`); rubrics are validated (`parseRubric`) and stored only if Canvas
published one. Links are kept only when they're https on the connected Canvas
origin. The mirror is a cache: each sync replaces the course's rows in one
transaction. File contents are not fetched (titles only, via module items).

### Retrieval
`src/lib/course/retrieval.ts`: Postgres full-text search over a generated
`tsvector` column (title weighted above body, GIN index) — no embeddings
provider, no extra cost, deterministic. Questions become OR-queries of plain
lexemes. Every query is scoped by the session's userId and, in a class-scoped
conversation, by that class; reads by id re-check ownership.

### Tutor (`/tutor`, `POST /api/tutor`)
- Model: `claude-opus-5-5`, adaptive thinking, `effort: "medium"`,
  `max_tokens` 8000, server-side refusal fallback (`fallbacks: "default"`).
- Manual tool loop (`src/lib/tutor/agent.ts`) so authorization stays in our
  code. Four read-only tools (`src/lib/tutor/tools.ts`): search materials, read
  a material, get an assignment (with description + rubric), list upcoming
  work. Inputs are schema-validated (`strict: true` plus zod); scope (user,
  class, assignment) comes from the session and the conversation row, never
  from the model. At most 6 tool rounds; the 7th call sets
  `tool_choice: none`.
- Retrieved Canvas text is wrapped in `<course_material>` tags (with any
  embedded closing tags stripped) and the system prompt treats it as data.
- Citations: the model writes `[[source:ID]]`; `resolveCitations` keeps only
  ids the tutor actually retrieved this turn and attaches titles/links from the
  database. Unknown ids are dropped — the model can't produce a link.
- Route handler: same-origin check (Server Actions get this built in; route
  handlers don't), session auth, per-user limits of 20 messages/hour and
  80/day (shared Postgres limiter), 60s max duration, NDJSON streaming.
- Stored: conversation title/mode/scope and message text + resolved sources.
  Usage events record token counts only. Students can delete one or all
  conversations.

### Draft feedback (`/assignments/:id`)
`src/lib/review/draft-review.ts` requires a rubric published in Canvas — no
rubric, no score. Structured output (zod schema) proposes a per-criterion
range, verbatim evidence, what works and what to improve. `reconcileReview`
then keeps only real criterion ids, clamps ranges to each criterion's points,
marks skipped criteria "not assessed", and drops any quote that isn't actually
in the draft (counted and disclosed). Results are labeled an AI estimate.
Drafts (200–30,000 chars) are stored for revision comparison and deletable.
Limit: 15 reviews per student per day.

### Cost
Opus 5.5 is $4 / $20 per million input/output tokens. A tutor turn with two
or three tool calls typically resends the conversation and retrieved excerpts
a few times; expect on the order of 10–30k input and 1–3k output tokens per
turn (roughly $0.06–0.18), less with prompt caching on the fixed system
prompt. A draft review is one call (~5–15k input, 2–5k output, roughly
$0.06–0.16). Per-user limits above bound the worst case per student per day.
Thinking tokens bill as output and can push turns above these figures.
These are estimates, not measurements: no live calls have been made yet.

### Not yet built
Phase C (resource recommendations) and phase D (agent actions on the
schedule, transparent long-term memory) are not implemented. File content
(PDF/DOCX) ingestion and draft upload are not implemented; drafts are pasted
as text.
