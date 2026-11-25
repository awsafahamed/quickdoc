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
