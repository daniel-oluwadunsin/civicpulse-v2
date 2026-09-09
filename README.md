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
- **Gemini:** set a real Gemini API key and currently supported model IDs for report analysis, matching, and routing. The worker records `FAILED`/`NEEDS_REVIEW` on failures; it never fabricates analysis.
- **Geoapify:** create a free commercial-tier project, put its public key in `VITE_GEOAPIFY_API_KEY` and server key in `GEOAPIFY_API_KEY`, and retain its required attribution. PostGIS—not Geoapify—resolves Nigerian jurisdiction.
- **SMTP:** standard SMTP variables support verification, password reset, and worker-delivered notifications once configured.

## Production data

Import reviewed GeoJSON boundary datasets with source, source URL, effective dates, and licensing provenance into `jurisdictions`; validate geometries and point-in-polygon tests before routing. Onboard government and NGO records through the verification workflow. Do not represent fixtures as real organizations or upload invented asset ownership.

## Verification

Run `npm run typecheck`, `npm run build`, and `npm run test`. Real Cloudinary, Gemini, SMTP, Geoapify, and production-boundary tests are **BLOCKED/UNVERIFIED** until credentials and licensed datasets are supplied. Deploy the Vite output statically, with API and worker as separate Node processes connected to the same managed PostGIS database.

## Known implementation boundary

The schema and API cover all primary domains; credential-dependent media/AI/email routes are intentionally real integrations rather than mocks. Complete UI workflows and the documented Playwright interaction inventory still need expansion before a production launch.
