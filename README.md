# QuickDoc Marketplace

Foundation workspace for a multi-vendor print and document-attestation marketplace.

## Workspace

- `apps/api` — NestJS API, authenticated customer/partner/admin operations, and Prisma database schema.
- `apps/customer-web` — Next.js customer-facing shell.
- `packages/shared-types` — framework-independent contracts shared by web and API.
- `docs` — product, architecture, data, workflow, security and delivery specifications.

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 15+ for database work
- Docker is optional but recommended for local infrastructure (not currently available in this environment).

## Commands

```powershell
npm install
npm run typecheck
npm run build
npm run db:validate
npm run dev:api
```

The API health check is available at `http://localhost:3001/api/v1/health`.
Copy `apps/api/.env.example` to the workspace root as `.env` (or to `apps/api/.env`), set a real `DATABASE_URL`, and set `JWT_SECRET` to a cryptographically random value before starting the API. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. The API loads either env-file location when started with `npm run dev:api`.

Local and test runs use private filesystem document storage by default when S3 credentials are absent. The files are stored under `apps/api/.private-documents/` (or `LOCAL_STORAGE_PATH`) and are served only through short-lived signed upload and preview links. Set `STORAGE_DRIVER=s3` with the S3 variables below to test an S3-compatible service. Local filesystem storage is rejected when `NODE_ENV=production`; production requires S3-compatible credentials and a private bucket.

### Local demo data

After applying migrations to a **development or test database**, seed repeatable records for customer, shop, rider, attestation-agent, and admin screens:

```powershell
$env:ALLOW_DEMO_SEED = "true"
npm run db:seed-demo
Remove-Item Env:ALLOW_DEMO_SEED
```

The script only adds or updates its `@quickdoc.test` fixtures; it does not delete database records. It refuses to run with `NODE_ENV=production` and requires the explicit `ALLOW_DEMO_SEED=true` confirmation. All demo accounts use `QuickDocDemo2026!` unless `DEMO_USER_PASSWORD` is set. Available logins: `customer@quickdoc.test`, `shop@quickdoc.test`, `pending-shop@quickdoc.test`, `rider@quickdoc.test`, `agent@quickdoc.test`, and `admin@quickdoc.test`. For the seeded rider assignment, use pickup code `A1B2C3` and delivery PIN `D4E5F6`. Demo PDF rows are database metadata only; previewing their files requires corresponding objects in configured private storage.

## Live Vercel frontends

- Customer: https://customer-web-murex-seven.vercel.app
- Shop: https://shop-web-gray.vercel.app
- Rider: https://rider-web-blue.vercel.app
- Agent: https://agent-web-neon.vercel.app
- Super admin: https://admin-web-omega-nine.vercel.app

These deployments currently use Vercel Authentication protection until it is disabled in each project's Vercel settings.

## Render API deployment

Use `render.yaml` with a Render Blueprint. Set these secret/environment values in the Render service:

- `DATABASE_URL`: production Neon PostgreSQL connection string with TLS (`sslmode=require`)
- `JWT_SECRET`: a cryptographically random secret
- `WEB_ORIGINS`: `https://customer-web-murex-seven.vercel.app,https://shop-web-gray.vercel.app,https://rider-web-blue.vercel.app,https://agent-web-neon.vercel.app,https://admin-web-omega-nine.vercel.app`
- `CUSTOMER_WEB_ORIGIN`: `https://customer-web-murex-seven.vercel.app`
- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`: values from a Google OAuth Web client
- `GOOGLE_OAUTH_REDIRECT_URI`: `https://quickdoc-fwuf.onrender.com/api/v1/auth/oauth/google/callback`
- `NODE_ENV=production`

The Blueprint builds from the workspace root, generates Prisma Client, and starts the API as a workspace package. The start command applies pending Prisma migrations and runs the optional admin bootstrap before starting the API. On Render Free this runs at each service start because pre-deploy commands are not available. The migration assumes the existing QuickDoc schema is already present; do not use it as a fresh-database baseline. Render supplies `PORT` automatically; local development can continue to use `API_PORT`.

To create the first administrator, temporarily set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` as Render environment secrets, then allow the service to redeploy. The password must be at least 16 characters. The startup bootstrap runs after migrations, creates an `ADMIN` role only when no administrator exists, and safely skips when the variables are absent or an administrator already exists. Remove the three bootstrap secrets from Render after the account is created; never commit them.
For Google sign-in, add `https://customer-web-murex-seven.vercel.app` as an authorized JavaScript origin and `https://quickdoc-fwuf.onrender.com/api/v1/auth/oauth/google/callback` as an authorized redirect URI in Google Cloud Console. Set the client ID and rotated client secret in Render's environment settings, never in source control or the customer-web deployment. Apply database migrations before using the OAuth login-code exchange endpoint.

Before deployment, validate migrations on staging. For an existing database, take a backup and inspect `prisma migrate status` and a read-only schema diff first; never execute the full baseline SQL against tables that already exist. The baseline may be marked applied only after verifying the existing base objects, and any missing baseline-era objects must be supplied by an additive migration. The `20261125140000_agent_operations` migration is idempotent for fresh and legacy databases; later migrations add OAuth login codes, print options, and the default attestation catalogue. Keep legacy rows in `_prisma_migrations` even when their original migration files are unavailable. The API provides `/api/v1/health/database` and `/api/v1/health` health endpoints. Render supplies `PORT` automatically; local development can continue to use `API_PORT`.

Set each Vercel project's root directory to its app folder (`apps/customer-web`, `apps/shop-web`, `apps/rider-web`, `apps/agent-web`, or `apps/admin-web`). The portal builds use `https://quickdoc-fwuf.onrender.com/api/v1` as the production API default and `http://localhost:3001/api/v1` for local development; set `NEXT_PUBLIC_API_URL` in Vercel when using a different API deployment. The admin portal also accepts a server-side `API_URL` override. The Render Blueprint configures `WEB_ORIGINS` for all five documented live portal domains. Local development accepts `localhost` and `127.0.0.1` origins on any port; production only accepts explicitly configured origins. Redeploy each project after changing these values. Disable Vercel Authentication protection only when the intended live domains are ready for public testing.

Customer registration and sign-in support email/password and Google OAuth. Google OAuth creates customer accounts for new verified Google email addresses and signs in existing accounts with the same verified email. Its callback exchanges a short-lived, single-use login code for the application session. Password reset uses Resend; configure `RESEND_API_KEY`, `EMAIL_FROM` (a verified Resend sender), and `CUSTOMER_WEB_ORIGIN` in the API environment before enabling it. Reset links are single-use and expire after 30 minutes. SMS OTP remains unavailable until an SMS provider is configured. Shop-owner account and shop-profile creation is performed as one database transaction; legacy owner accounts without a linked shop can finish setup after signing in. The shop catalogue stores private PDFs and exposes only published metadata from approved shops; customers receive a private copy when selecting a catalogue document for an order. Admin scripts load `apps/api/.env` or the repository-root `.env` for `DATABASE_URL`; environment variables already set by the host take precedence. To create the first administrator, run `npm --workspace apps/api run admin:bootstrap` once against the migrated database with `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 16 characters supplied through a secure environment. The script refuses to run if an administrator already exists. To create another administrator without elevating an existing account, run `npm --workspace apps/api run admin:create` with `ADMIN_CREATE_EMAIL`, `ADMIN_CREATE_NAME`, and `ADMIN_CREATE_PASSWORD` (at least 16 characters). To reset an existing, non-suspended administrator's password, run `npm --workspace apps/api run admin:reset-password` against the same database with `ADMIN_RESET_EMAIL` and `ADMIN_RESET_PASSWORD` (at least 16 characters); this also revokes that account's active refresh sessions. After deployment, test customer registration/login and the shop-owner, rider, agent, and admin logins from their respective live Vercel domains.

Payments are cash on delivery. PayHere online payments and refunds are not enabled until the provider's production endpoint and response/status semantics can be verified; do not treat a recorded payment as refunded based on an unverified response.

## Document storage (AWS S3)

The API accepts either naming style for the storage variables:
- `AWS_S3_BUCKET` or `S3_BUCKET`
- `AWS_REGION` or `S3_REGION`
- `AWS_ACCESS_KEY_ID` or `S3_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY` or `S3_SECRET_ACCESS_KEY`

Browsers upload PDFs to the QuickDoc API, not straight to the bucket. The API checks that each file is a real PDF under 25 MB and stores it privately in S3. The upload link points at the API's public URL, which Render provides automatically as `RENDER_EXTERNAL_URL`; set `API_PUBLIC_URL` on other hosts. Previews are short-lived signed S3 links that open in a new tab.

**Check storage after deploying:** open `https://<api-host>/api/v1/health/storage`. It writes, reads and deletes a tiny test file. `{"status":"ok",...}` means uploads will work. Otherwise the message names the problem, such as AccessDenied, InvalidAccessKeyId, NoSuchBucket or a region mismatch, and the same S3 error is logged on the API host.

As a result, the bucket needs no CORS rules. It does need:

1. **Block all public access** turned on.
2. **An IAM user policy** allowing `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/private/*`. `s3:GetObject` also covers the HeadObject check, and CopyObject needs `s3:GetObject` plus `s3:PutObject`.

## Order lifecycle and money flow

1. **Order placed.** Pricing is always recomputed on the server. The page count is read from the stored PDF, and the delivery distance is calculated from the shop's coordinates to the customer's delivery coordinates. Orders beyond `MAX_DELIVERY_DISTANCE_KM` (default 50) are refused. A pending cash-on-delivery `Payment` is created, along with an encrypted pickup code and delivery PIN.
2. **Shop works the order.** Accept or decline, then printing, then ready for pickup. The customer is notified at each step. Only approved shops can handle orders. Declines void the pending payment.
3. **Handover.** The shop sees the pickup code and the customer sees the delivery PIN. Riders never receive either code; they must enter them in person. Five wrong entries lock the code until the shop or customer issues a new one. Customers can cancel until printing starts. A shop can cancel an accepted, printing or ready order with a reason, until a rider is assigned. Orders a shop does not accept within `SHOP_ACCEPTANCE_TIMEOUT_HOURS` (default 24) are cancelled automatically, and the customer is told they were not charged. A rider who cannot collect an order releases it before pickup; it is re-offered to other nearby riders, never back to the rider who released it. A failed delivery can only be reported after pickup.
4. **Delivery.** A correct PIN marks the delivery done and records the cash payment as `PAID`.
5. **Completion.** This happens when the customer confirms, or automatically 48 hours after delivery. QuickDoc then writes idempotent ledger entries and three settlements:
   - a shop payout (print subtotal minus 10% commission)
   - a rider payout (the delivery earnings)
   - a rider `CASH_REMITTANCE` for the cash they collected

   Customers can leave one review, which feeds the public shop rating.
6. **Settlement.** In the admin Finance view, record each payout or cash handover with its bank or receipt reference after the money has moved. The partner is notified.

Attestation bookings follow the same pattern. Customers can cancel before collection. Agents move a job through received, processing, attested, ready for return, and returned. The final step completes the job, creates the agent's payout, and notifies the customer at each stage.

## Address lookup (Google Maps)

The customer and shop portals look addresses up on Google's map through a server-side route, `/api/geocode`. Customers can find a typed delivery address without sharing their device location, saved addresses are pinned on the map automatically, and shops can fill in their coordinates from their address.

Set `GOOGLE_MAPS_API_KEY` in the Vercel projects for **customer-web** and **shop-web**, for all environments, then redeploy. Keep the name exactly that: **do not** add a `NEXT_PUBLIC_` prefix, because that would publish the key to every browser. In Google Cloud, enable the **Geocoding API** and restrict the key to that API only. Results are biased to Sri Lanka; set `GOOGLE_MAPS_REGION` to change this.

Without the key, the portals fall back to the device-location buttons. The route accepts same-origin requests only and allows 20 lookups per minute per IP per server instance.

## Production operations

- **Security headers and limits.** The API sends Helmet security headers and caps JSON bodies at 100 KB. It applies a per-IP rate limit of `RATE_LIMIT_PER_MINUTE` (default 240), with much tighter limits on login, registration and password reset. Render terminates TLS at one proxy hop; set `TRUST_PROXY_HOPS` if that changes, so rate limits see real client IPs.
- **Sessions.** Access tokens last 15 minutes. Every request re-checks the account in the database, so suspensions and role changes apply immediately. Refresh tokens rotate atomically. Replaying a rotated token more than 30 seconds later revokes the whole session family. The customer, shop, rider and agent portals renew sessions transparently, including in new tabs.
- **Startup checks.** The API refuses to start without `DATABASE_URL`, and needs a `JWT_SECRET` of at least 32 bytes in production. It logs a warning for each optional integration that is missing (S3, Resend, Google OAuth) and the feature that is unavailable as a result.
- **Encryption key.** Set `DATA_ENCRYPTION_KEY` (the Blueprint generates one). It encrypts handover codes, so do not rotate it while orders are in flight.
- **Background jobs.** A maintenance sweep runs every 15 minutes and shortly after start-up. It completes stale delivered orders and deletes expired PDFs that are not attached to an order. Every step is idempotent and safe on several instances. Set `DISABLE_BACKGROUND_JOBS=true` to turn it off.
- **Pricing defaults are placeholders.** The built-in print and delivery rates (for example LKR 0.50 per black-and-white side and a LKR 10 delivery base) are not market prices. Riders are paid the order's delivery fee. Set real values in the admin catalogue, and each shop's per-side prices, before launch.
