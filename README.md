# Propwealth Meta Attribution MVP

Version 1 connects three operational data sources without asking agents to duplicate appointment, viewing, or negotiation updates:

1. Meta Lead Report
2. Meta Ads Performance Report
3. propwealth.my Commission Payout CSV / Excel Export

## Included

- Administrator email/password login with PBKDF2-SHA-256 (600,000 iterations and a unique salt), server-side sessions, login throttling, CSRF-origin checks and audit entries. No self-registration or production mock login.
- Two-step preview/confirmation for the three report types. Lead and Ads imports require an Agent ID; commission lines use their own PW agent codes. Missing event dates are errors, and out-of-range rows need explicit confirmation.
- Private R2 original-file archive, SHA-256 file hash, import history, row-level provenance, duplicate-file protection and atomic D1 record updates. Legacy records retain an unknown source until reimported.
- Lead ID, Campaign, Ad Set, and Ad normalization
- Test-lead exclusion and conflict-safe repeat-import upserts
- Real date filters. Monthly Agent ROI groups agent-assigned Ads spend by `Day` and direct agent `Commission` payout lines by `Commission Payout Date`. It does not require a Meta Lead-to-Sale link. A zero or missing Ads denominator leaves ROI unavailable.
- Full-data UTF-8 CSV exports include Leads, Ads, Commission sales, Campaign performance, Summary and monthly Agent ROI. Text from Excel is escaped against CSV formula injection; exports and original-file downloads are audited.
- Contextual **Download CSV** buttons sit beside their reports. Meta lead inbox export follows the applied date range and name/phone/email search, including matching rows beyond the 100-row on-screen limit.
- Import history has its own **Download CSV** button, following its type, status and coverage-date filters. An archived original Excel remains downloadable on its batch row; legacy batches without an archived original are labeled unavailable.
- For feature testing, an administrator can **Remove** a completed, archived import from active data after confirming its exact file name. Only that batch's still-current rows are removed; its history, private original file and audit entry remain. Removed files can be imported again with the same hash. Legacy imports without an archived original cannot be removed this way.
- Meta lead inbox, search, Agent assignment, and WhatsApp shortcut
- Booking, Sale, estimated Commission, and paid Commission views
- Customer commission export adapter: `Sales No` snapshots with all payout lines retained and `Agent` `[PWxxxxx]` extraction. The latest completed Sales No snapshot supplies direct commission lines to monthly Agent ROI; introducer and overriding lines are excluded.
- D1-backed persistent records and generated database migration
- Responsive desktop and mobile interface

## Propwealth source mapping

The commission export supplied by the customer can be uploaded unchanged as **Propwealth Commission Payout Export** (`.csv`, `.xlsx`, `.xls`). The adapter reads `Sales No`, `Project Name`, `Unit Number`, `Date`, `Agent`, `Commission Type` and `Commission Amount (RM)`, and preserves its other payout fields. One `Sales No` is shown once even if it has many payout rows and agents. `Date` is labeled source date until its business meaning is confirmed. `Commission Payout Date`, `Has PV`, and `Balance` do not prove actual payment. For this source, leave coverage dates blank to derive the min/max source dates, or declare an explicit range.

The older Booking / Sale import remains in the database for historical compatibility but is not offered in the current import form and does not feed monthly Agent ROI.

For existing Ads imports that predate Agent selection, open **Import history** and save the correct Agent ID on the completed Ads batch. The original workbook is not altered. Import the corrected commission test CSV as a new batch to replace the earlier Sales No snapshots; repeat imports of the exact same file are deduplicated. The monthly ROI report and its CSV then use the latest effective data. Legacy manual Lead links are retained only as historical records and no longer enter ROI.

## Local development and first administrator

```powershell
npm run install:ci
npm run build
# Apply all three migrations to a NEW local D1 database. For an existing MVP database,
# apply only the migrations it has not received; this change adds 0002.
$pwState = Join-Path $env:LOCALAPPDATA 'PropwealthMetaAttribution\state'
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to $pwState --file drizzle/0000_needy_gamora.sql --yes
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to $pwState --file drizzle/0001_far_makkari.sql --yes
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to $pwState --file drizzle/0002_eager_spacker_dave.sql --yes
npm run admin:local admin@example.com
npm run dev
```

The local application runs at `http://localhost:5172` by default. On Windows, local D1/R2 state is stored under `%LOCALAPPDATA%\PropwealthMetaAttribution\state` so OneDrive cannot lock the database. The password prompt is hidden. Running `admin:local` for the same email resets its password and revokes existing sessions. Do not put passwords in shell arguments, source, `.env` files or logs.

For a deployed D1 database, run `node scripts/admin-account.mjs --sql admin@example.com` interactively and execute the generated SQL in the **intended** D1 environment using an approved private admin channel. Do not commit or publicly paste the output, as it contains a password verifier. Apply both migrations before first deployment, or only `0001` when upgrading an existing database. Remote migrations and account creation are intentionally not performed by this repository.

The `IMPORT_ARCHIVE` R2 binding is configured for local development in `.openai/hosting.json`. Before production imports, create a private R2 bucket, bind it to the Worker as `IMPORT_ARCHIVE`, leave public bucket access disabled, and set an explicit long-term retention/backup policy. The app fails closed if the binding is absent. Production D1/R2 provisioning and deployment require the owner's Cloudflare account configuration.

Imports are limited to 10 MB and 1,500 workbook rows per transaction in this MVP. CSV exports are independent of the 100-row on-screen list and support up to 100,000 rows per request. Re-import original historical files to attach accurate provenance; the app does not invent it for legacy data.

## Verification

```powershell
npx tsc --noEmit
npm run lint
npm run build
# After creating a local test admin (set PW_TEST_EMAIL if it is not admin@localhost.test):
$env:PW_TEST_PASSWORD = Read-Host "Test admin password"
node scripts/smoke-test.mjs
```

Set `PW_TEST_BASE_URL` and `PW_TEST_IMPORT=1` only against a disposable local D1/R2 state: that mode imports synthetic test rows. The smoke script checks authentication, dashboard, UTF-8 CSV, preview validation and download authorization; in isolated import mode it also checks archived file retrieval, provenance, exact duplicate handling and CSV formula safety.

The earlier local MVP records remain intact and display `Legacy source unknown`. The propwealth.my Booking import follows the agreed field contract; validate its mapping with an actual client export before production use.
