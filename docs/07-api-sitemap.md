# API Specification and UI Sitemap

All endpoints are under `/api/v1`, return a consistent envelope and accept an idempotency key for payment/order mutations.

Core endpoint groups:

```text
GET    /health
POST   /auth/otp/request
POST   /auth/otp/verify
GET    /me
GET    /services
POST   /documents
POST   /quotes
POST   /orders
GET    /orders/:id
POST   /orders/:id/transitions
GET    /orders/:id/timeline
POST   /payments/webhooks/:provider
GET    /shops/nearby
GET    /notifications
```

Customer sitemap: Home → Select service → Upload/configure → Quote → Provider → Checkout → Order tracking → History/support. Partner portals and admin operations are separate route groups sharing the same API.

Agent portal routes require an authenticated `AGENT` account and operate only on the caller's own profile:

```text
GET    /agents/me
POST   /agents/register
PATCH  /agents/me
PATCH  /agents/me/availability
GET    /agents/me/jobs
POST   /agents/me/jobs/:jobId/custody
GET    /agents/me/services
POST   /agents/me/services
POST   /agents/me/services/batch
GET    /agents/me/earnings
GET    /agents/me/notifications
PATCH  /agents/me/notifications/:notificationId/read
```

Agent registration remains pending review until approved. Only approved agents can accept work; custody updates are recorded as actor-attributed events and follow the attestation state sequence. Settlement records are read-only in the agent portal.

Rider profile, availability and assignment routes require a rider JWT. Rider identity is derived from the token; assignment endpoints do not accept caller-selected rider IDs:

```text
POST   /riders/register
GET    /riders/me
PATCH  /riders/me
POST   /riders/availability
GET    /riders/me/assignments
GET    /riders/me/earnings
POST   /riders/assignments/:id/accept
POST   /riders/assignments/:id/reject
POST   /riders/assignments/:id/status
POST   /riders/assignments/:id/location
```

Rider applications start pending. Only approved riders can go online or access assigned work; pickup and delivery status changes require the matching server-validated handover code. The customer/shop-facing code delivery flow is not implemented yet, so those transitions remain a launch blocker.

All `/admin` routes require an authenticated `ADMIN` role. Rider status changes are committed with an actor-attributed audit event.

The admin portal uses a same-origin web API proxy. It keeps API access and refresh tokens in `HttpOnly`, `SameSite=Strict` cookies, checks the request `Origin` on mutations, and forwards only allowlisted admin operations. Configure the admin deployment with `API_URL` (or `NEXT_PUBLIC_API_URL`) pointing at this API.

Admin operations currently available:

```text
GET    /admin/overview
GET    /admin/users?page=1&pageSize=50&search=
PATCH  /admin/users/:id/suspended
GET    /admin/shops?page=1&pageSize=50&search=
PATCH  /admin/shops/:id/status
GET    /admin/riders?page=1&pageSize=50&search=
PATCH  /admin/riders/:id/status
GET    /admin/agents?page=1&pageSize=50&search=
PATCH  /admin/agents/:id/status
GET    /admin/orders?page=1&pageSize=50&search=
PATCH  /admin/orders/:id/status
GET    /admin/services
GET    /admin/catalog
POST   /admin/catalog/services
PATCH  /admin/catalog/services/:code
PATCH  /admin/catalog/pricing/:key
GET    /admin/finance
GET    /admin/support?page=1&pageSize=25&search=&status=
GET    /admin/support/:id
PATCH  /admin/support/:id
POST   /admin/support/:id/messages
GET    /admin/audit?page=1&pageSize=50
GET    /admin/settings
PATCH  /admin/settings
```

Customer support requests are created and replied to with `CUSTOMER` authentication:

```text
GET    /customer/support
POST   /customer/support
GET    /customer/support/:id
POST   /customer/support/:id/messages
```

Customer ticket responses never include internal notes. Admin replies, status/priority changes and assignment are audited; settlements remain read-only.

The admin finance view is read-only. PayHere refund processing is not exposed until the production endpoint and provider response/status contract are verified.

The global catalogue is stored in `PlatformCatalogService` and `PlatformPricingRule`. Public attestation listings/quotes and print quotes/order totals read those persisted values. The additive schema change is applied by Render's pre-deploy `prisma migrate deploy`; it assumes the previously deployed QuickDoc tables already exist. On any non-Render environment, run `npm --workspace apps/api run prisma:migrate` with the correct `DATABASE_URL` before deploying the new API build. Do not apply the incremental SQL as a fresh-database baseline.

List routes return `{ data, pagination }`, cap page size at 100 and expose only operational fields; in particular, user credential hashes and order delivery PIN hashes are never returned. Order status overrides require a reason and atomically write status history and an audit record. Partner status changes, account suspensions, support actions and catalogue changes are audited.
