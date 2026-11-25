# QuickDoc Marketplace

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
Copy `apps/api/.env.example` to the workspace root as `.env` (or to `apps/api/.env`), set a real `DATABASE_URL`, and set `JWT_SECRET` to a cryptographically random value before starting the API. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. The API loads either env-file location when started with `npm run dev:api`.

## Live Vercel frontends

- Customer: https://customer-web-murex-seven.vercel.app
- Shop: https://shop-web-gray.vercel.app
- Rider: https://rider-web-blue.vercel.app
- Agent: https://agent-web-neon.vercel.app
- Super admin: https://admin-web-omega-nine.vercel.app

These deployments currently use Vercel Authentication protection until it is disabled in each project's Vercel settings.

## Render API deployment

Use `render.yaml` with a Render Blueprint. Set these secret/environment values in the Render service:

- `DATABASE_URL`: production Neon pooled PostgreSQL connection string
- `JWT_SECRET`: a cryptographically random secret
- `WEB_ORIGINS`: comma-separated production frontend origins
- `NODE_ENV=production`

The Blueprint builds from the workspace root, generates Prisma Client, and starts the API as a workspace package. Render supplies `PORT` automatically; local development can continue to use `API_PORT`.

After the Render service is deployed, set `NEXT_PUBLIC_API_URL` in **all five Vercel frontend projects** (customer, shop, rider, agent and admin) to `https://<render-service>/api/v1`, then redeploy each project so the public variable is included in its build. Add all five production frontend origins to `WEB_ORIGINS` in Render so browser requests pass CORS checks.
