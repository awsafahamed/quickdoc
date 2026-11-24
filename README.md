# Print & Attest Marketplace

Foundation workspace for a multi-vendor print and document-attestation marketplace.

## Workspace

- `apps/api` — NestJS API boundary, health endpoint, Prisma schema and future domain modules.
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
Copy `.env.example` to `.env` and set a real `DATABASE_URL` before connecting Prisma.
