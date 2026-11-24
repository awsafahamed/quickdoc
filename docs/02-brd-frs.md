# Business and Functional Requirements

## Business rules
1. Only verified partners may receive production work.
2. Prices, commissions and delivery fees are configurable data, never frontend constants.
3. A payment is confirmed only by a trusted server-side provider response or webhook.
4. Every workflow transition has an actor, timestamp and audit record.
5. Sensitive documents use private storage and short-lived access grants.

## Functional requirements
| Area | Requirement |
| --- | --- |
| Identity | OTP login, role and permission checks, session revocation |
| Documents | Validate type/size, scan, version, access log and retention policy |
| Print | Quote options, eligible shops, acceptance, fulfilment and delivery |
| Attestation | Requirements, verified agent, custody chain, processing and return |
| Finance | Payment intents, webhooks, refunds, commissions and settlements |
| Operations | Search, manual assignment, support, dispute and audit views |
| Notifications | In-app plus provider adapters for SMS, WhatsApp and email |
