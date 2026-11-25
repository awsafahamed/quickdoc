# API Specification and UI Sitemap

All endpoints are under `/api/v1`, return a consistent envelope and accept an idempotency key for payment/order mutations.

Initial and planned groups:

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
