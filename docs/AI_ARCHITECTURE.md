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
