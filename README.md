# CivicPulse

CivicPulse is an incident-centric Nigerian civic-infrastructure reporting and accountability application. It uses React/Vite, Express, PostgreSQL/PostGIS, Graphile Worker, Cloudinary, Gemini, and Geoapify—without Redis, an ORM, vector database, or microservices.

## Run locally

1. Copy `.env.example` to `.env` and set `SESSION_SECRET` (at least 24 characters). Provider-backed workflows intentionally remain unavailable until their real credentials are configured.
2. `npm install`
3. Install PostGIS in your local PostgreSQL distribution; as its local superuser run `CREATE EXTENSION postgis` once in both `civicpulse` and `civicpulse_test`, then run `npm run db:migrate`.
4. In separate terminals: `npm run dev:api`, `npm run dev:worker`, and `npm run dev:web`.

The web app runs at `http://localhost:5173`; API health is at `http://localhost:4000/health`.

## Provider setup

- **Cloudinary:** create an authenticated evidence folder and provide its cloud name, key, and secret. The browser receives only short-lived signed upload parameters; the API verifies every returned asset before attaching it.
- **Gemini:** set one or more real Gemini API keys and currently supported model IDs for report analysis, matching, and routing. Transient failures remain retryable; `FAILED` is recorded only after the worker exhausts its attempts, while ambiguous outcomes become `NEEDS_REVIEW`. Temporary Gemini files are deleted after analysis.
- **Geoapify:** create a free commercial-tier project, put its public key in `VITE_GEOAPIFY_API_KEY` and server key in `GEOAPIFY_API_KEY`, and retain its required attribution. PostGIS—not Geoapify—resolves Nigerian jurisdiction.
- **SMTP:** Gmail uses `smtp.gmail.com` on port `587` with the account address and a Google app password. Verification, password reset, organization invitation, and worker-delivered messages use the shared Nodemailer transport.

## Production data

Import reviewed GeoJSON boundary datasets with source, source URL, effective dates, and licensing provenance into `jurisdictions`; validate geometries and point-in-polygon tests before routing. Onboard government and NGO records through the verification workflow. Do not represent fixtures as real organizations or upload invented asset ownership.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test`. Set `TEST_DATABASE_URL` to the dedicated `civicpulse_test` database, then run `npm run test:integration` and `npm run test:e2e:functional` for real PostgreSQL/API/browser coverage. Real Cloudinary, Gemini, SMTP, Geoapify, and production-boundary tests remain **BLOCKED/UNVERIFIED** whenever their credentials or licensed datasets are absent. Deploy the Vite output statically, with API and worker as separate Node processes connected to the same managed PostGIS database. API and worker startup fails clearly when application migrations are pending.

## Known implementation boundary

The public incident, government operations, NGO intervention, operational-evidence, moderation, and invitation-only organization onboarding surfaces use real APIs. New organization applications begin with a CivicPulse-admin invitation; verified organization administrators invite staff. Credential-dependent media, AI, geocoding, and email routes are intentionally real integrations rather than fake successes.
