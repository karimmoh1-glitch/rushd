# Setting up Rushd's outside services

Production runs on Vercel (project `internops`, scope `karims-projects-54b12a26`)
with a Neon Postgres database, at https://therushd.com. It already has
`DATABASE_URL`, `SESSION_SECRET`, `CANVAS_TOKEN_ENCRYPTION_KEY` and
`NEXT_PUBLIC_APP_URL`. Everything below is optional: each feature explains
itself in the app and falls back gracefully until its keys are set.

## How to add a key to production

```bash
npx vercel env add NAME production --scope karims-projects-54b12a26
```

Paste the value when prompted (it is not echoed or logged). Environment
changes only take effect on the next deploy:

```bash
npx vercel --prod --scope karims-projects-54b12a26
```

Never paste keys into chat, commits, GitHub issues or screenshots.

## 1. AI (tutor, practice checks, draft review)

1. https://console.anthropic.com → Settings → API keys → Create key ("rushd-prod").
2. Billing → set a monthly spend limit you're comfortable with.
3. `npx vercel env add ANTHROPIC_API_KEY production ...`
4. Optional second guard inside Rushd: `AI_MONTHLY_BUDGET_USD` (e.g. `50`), also
   editable at /admin/ai. Emergency stop: the toggle at /admin/ai (instant), or
   set `AI_KILL_SWITCH=on` and redeploy.

## 2. Video recommendations (YouTube)

1. https://console.cloud.google.com → create a project "Rushd".
2. APIs & Services → Library → enable **YouTube Data API v3**.
3. Credentials → Create credentials → API key. Edit it → API restrictions →
   restrict to YouTube Data API v3. (Leave application restrictions off: the key
   is only used server-side and Vercel's IPs change.)
4. `npx vercel env add YOUTUBE_API_KEY production ...`

The default quota is 10,000 units a day and each YouTube search costs 100, so
watch Quotas in the console as usage grows and request more when needed. Until
the key is set, Rushd links to Khan Academy searches instead.

## 3. Payments (Stripe), test mode first

1. https://dashboard.stripe.com → toggle **Test mode** on.
2. Product catalog → add two products, each with a recurring monthly price:
   - **Rushd Plus**: $10/month
   - **Rushd Pro**: $20/month
   Copy each price ID (`price_...`).
3. Developers → Webhooks → Add endpoint
   - URL: `https://therushd.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`,
     `customer.subscription.paused`, `customer.subscription.resumed`
   - Copy the signing secret (`whsec_...`).
4. Settings → Billing → Customer portal → activate it; allow cancelling and
   switching between Plus and Pro.
5. Add to Vercel: `STRIPE_SECRET_KEY` (`sk_test_...`), `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`. Redeploy.
6. Test: sign up, go to /upgrade?plan=PLUS, pay with card `4242 4242 4242 4242`,
   any future date, any CVC. Settings should show Plus within a few seconds.
7. Going live: repeat steps 2–5 with Test mode **off** (live keys, live price
   IDs, a live webhook with its own secret), then redeploy.

## 4. Microsoft Teams for Education

Rushd reads classes, assignments, due dates, points and turned-in status. It
never writes to Teams.

1. https://entra.microsoft.com (sign in with any Microsoft work account you
   control; a free Azure account works) → Identity → Applications →
   **App registrations** → New registration.
   - Name: `Rushd`
   - Supported account types: **Accounts in any organizational directory
     (multitenant)**
   - Redirect URI: platform **Web**,
     `https://therushd.com/api/integrations/teams/callback`
2. Overview → copy **Application (client) ID** → `MICROSOFT_CLIENT_ID`.
3. Certificates & secrets → New client secret (24 months; put the expiry date
   in your calendar) → copy the **Value** (not the Secret ID) →
   `MICROSOFT_CLIENT_SECRET`.
4. API permissions → Add a permission → Microsoft Graph → **Delegated**:
   `openid`, `profile`, `offline_access`, `User.Read`, `EduRoster.ReadBasic`,
   `EduAssignments.ReadBasic`. Don't add anything with "Write" or
   "ReadWrite".
5. Branding & properties: logo, home page `https://therushd.com`, terms
   `https://therushd.com/terms`, privacy `https://therushd.com/privacy`.
6. Strongly recommended: **publisher verification** (Branding & properties →
   add a verified publisher, needs a free Microsoft AI Cloud Partner Program
   ID). Many school tenants block students from approving unverified
   multitenant apps.
7. Add `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` to Vercel. Leave
   `MICROSOFT_TENANT_ID` unset (it defaults to any school or work account) unless
   you want to lock Rushd to one school's tenant ID. Redeploy.
8. Test: Settings → Microsoft Teams → Connect, with a school account that has
   Teams assignments.

**Schools that require admin approval.** If a student sees "your school needs
to approve Rushd", send the school's IT admin this link (replace the client ID):

```
https://login.microsoftonline.com/organizations/adminconsent?client_id=YOUR_CLIENT_ID&redirect_uri=https://therushd.com/api/integrations/teams/callback
```

Once an admin approves it, every student at that school can connect. Expect to
answer questions about data use; point them to https://therushd.com/privacy.

## 5. Search (Google Search Console)

1. https://search.google.com/search-console → Add property → **Domain** →
   `therushd.com`.
2. Add the TXT record it shows at your DNS provider; click Verify.
3. Sitemaps → submit `https://therushd.com/sitemap.xml`.
4. Optional: do the same at https://www.bing.com/webmasters (it can import from
   Search Console).

## 6. Founder page

Fill in `src/content/founder.ts` (photo, short story, profile links). Details
in `docs/FOUNDER_PAGE.md`. Empty fields aren't shown.

## 7. Make yourself an admin

Sign up on therushd.com with your own email, then run once (a single-row
update; nothing is deleted):

```bash
psql "$DATABASE_URL" -c "UPDATE \"User\" SET \"isAdmin\" = true WHERE email = 'you@example.com';"
```

That unlocks /admin (AI spend and kill switch, growth numbers, invite codes,
password-reset links).

## 8. A separate development database (recommended)

Local development currently points at the same Neon database as production.
In the Neon console → your project → Branches → **Create branch** `dev` from
`main`, copy its connection string, and put it in your local `.env` as
`DATABASE_URL`. Production keeps the `main` branch. Migrations then get tried
on `dev` before they ever touch real students' data.

## 9. Desktop app signing (optional, costs money)

Unsigned builds work but show "unidentified developer" (macOS) and SmartScreen
(Windows) warnings. Add these as GitHub repository secrets (Settings → Secrets
and variables → Actions) and the release workflow picks them up:

- **macOS** (Apple Developer Program, $99/year): create a *Developer ID
  Application* certificate, export it as `.p12`, then
  - `APPLE_CERTIFICATE`: `base64 -i cert.p12`
  - `APPLE_CERTIFICATE_PASSWORD`: the .p12 password
  - `APPLE_SIGNING_IDENTITY`: e.g. `Developer ID Application: Your Name (TEAMID)`
  - `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password from
    appleid.apple.com), `APPLE_TEAM_ID` (for notarization)
- **Windows**: a code-signing certificate (`.pfx`) from a CA such as SSL.com or
  Certum, then `WINDOWS_CERTIFICATE` (`base64` of the .pfx) and
  `WINDOWS_CERTIFICATE_PASSWORD`.

Release a new desktop version by bumping the version in
`desktop/src-tauri/tauri.conf.json` (and `package.json`, `Cargo.toml`), then:

```bash
git tag desktop-vX.Y.Z && git push origin desktop-vX.Y.Z
```

When the GitHub release finishes, update `src/lib/desktop-release.ts` to the
new file names so the download links point at it.
