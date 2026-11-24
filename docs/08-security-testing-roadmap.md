# Security, Testing and Roadmap

## Security and privacy
Use TLS, private buckets, malware scanning, short-lived signed URLs, ownership checks, access logs, retention holds, redacted structured logs, rate limits, secure headers, CSRF protection where cookie sessions are used, and verified payment webhooks. Threat-model document access, OTP abuse, replayed webhooks, privilege escalation and custody disputes before production.

## Testing strategy
- Unit: pricing, transition guards, permission checks and idempotency.
- Integration: PostgreSQL repositories, storage grants and payment webhooks.
- API: Jest/Supertest contract tests.
- Browser: Playwright happy paths and failure states.
- Security: dependency scanning, upload abuse, authorization matrix and secret scanning.

## Roadmap
1. Foundation (current): architecture, contracts, health endpoint and Prisma baseline.
2. Identity/RBAC and customer profile.
3. Document upload and print quotation.
4. Shop fulfilment and delivery dispatch.
5. Payment, notifications, support and reporting.
6. Attestation workflow and agent portal.
7. Production hardening, observability and mobile clients.

Outstanding decisions: launch country/legal retention rules, OTP/payment/courier providers, map provider, SLA definitions and operational staffing model.
