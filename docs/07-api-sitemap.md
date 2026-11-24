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
