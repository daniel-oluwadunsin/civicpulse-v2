# CivicPulse Environment, Setup, Deployment and Operations

This runbook targets the simplified architecture: React/Vite + Express/TypeScript + PostgreSQL/PostGIS + Graphile Worker + Cloudinary + Gemini.

---

# 1. Local requirements

- Node.js 22 LTS.
- npm.
- PostgreSQL with PostGIS, either local or Docker.
- Cloudinary account for real media integration testing.
- Gemini API key for real AI integration testing.
- SMTP credentials if email verification/reset/notifications are enabled.
- a map/geocoding provider credential if the selected frontend/geocoder requires one.

---

# 2. Environment variables

The implementation must generate a complete `.env.example` with comments. Never put real secrets in source control.

Suggested server variables:

```text
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://...
DATABASE_SSL_REJECT_UNAUTHORIZED=true
SESSION_COOKIE_NAME=civicpulse_session
SESSION_SECRET=...
SESSION_TTL_DAYS=30

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_EVIDENCE_FOLDER=civicpulse/evidence

GEMINI_API_KEY=
GEMINI_MODEL_REPORT_ANALYSIS=
GEMINI_MODEL_ROUTING=
GEMINI_MODEL_MATCHING=

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

APP_PUBLIC_URL=http://localhost:5173
API_PUBLIC_URL=http://localhost:4000

# selected map/geocoding provider, if required
MAP_PROVIDER=
MAP_API_KEY=
GEOCODER_BASE_URL=
```

Frontend may receive only browser-safe values, prefixed according to Vite conventions:

```text
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_MAP_PUBLIC_TOKEN=
```

Never expose:

- Cloudinary API secret;
- Gemini API key;
- database URL;
- session secret;
- SMTP password.

Keep `DATABASE_SSL_REJECT_UNAUTHORIZED=true` when the managed PostgreSQL
provider supplies a trusted CA. If a provider uses a private/self-signed CA
that cannot be installed in the runtime, set it to `false` only for the
provider-managed private connection and keep the database inaccessible from
the public internet.

For Gmail, `SMTP_USER` is the Gmail address, `SMTP_PASS` is a Google app
password, and `EMAIL_FROM` must be that address or a configured sending alias.
The application requires TLS and reuses a pooled Nodemailer transport.

---

# 3. Database setup

Enable PostGIS:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Run versioned migrations using the repository migration command.

Expected commands should be documented by Codex, for example:

```text
npm run db:migrate
npm run db:status
```

Production migrations must be applied before starting a version that depends on them.

---

# 4. Background worker setup

Graphile Worker uses the same PostgreSQL database.

The backend should expose commands such as:

```text
npm run dev:api
npm run dev:worker
npm run start:api
npm run start:worker
```

Development may offer a combined convenience command, but production should be able to run API and worker independently so a long media workload does not compete directly with HTTP throughput.

There is no Redis service to configure.

---

# 5. Cloudinary setup

Create/configure:

1. Cloudinary account/cloud.
2. server-side cloud name/API key/API secret.
3. folder strategy for evidence.
4. signed uploads only for citizen evidence.
5. upload limits appropriate for accepted image/audio/video formats.
6. restricted/authenticated delivery policy for sensitive originals.

The browser requests an upload signature from Express and uploads directly to Cloudinary.

There is **no Cloudinary webhook requirement**.

After upload, Express verifies the asset before associating it with a report.

---

# 6. Gemini setup

Use the current official Google Gen AI SDK.

Do not hard-code a model name from this handoff if provider availability has changed. Codex must check current official Gemini docs and then place selected model identifiers in environment/configuration.

Use dedicated config values for report analysis/routing/matching if different models are intentionally selected. They may all use the same model initially.

Real integration check should cover:

- text report;
- image report;
- audio transcription/language detection;
- video analysis where account/model limits permit;
- structured output validation;
- malformed/failed response handling.

---

# 7. Map/geocoding setup

The product requires:

- browser/device geolocation;
- map pin confirmation/adjustment;
- reverse geocoding for a human-readable location where desired;
- PostGIS boundary lookup for jurisdiction.

The map provider is not the source of government jurisdiction. PostGIS is.

If no map/geocoding provider has been selected when Codex reaches this integration, it should ask the user rather than inventing a paid provider choice.

---

# 8. Boundary data

CivicPulse cannot route nationally without jurisdiction polygons.

Production workflow:

1. obtain an appropriate official/credible boundary dataset;
2. record source/license/version;
3. validate GeoJSON/shape data;
4. import into `jurisdictions`;
5. create spatial indexes;
6. run point-in-polygon sanity tests on known locations;
7. expose admin tooling for dataset updates where appropriate.

Do not seed invented Nigerian boundaries into production.

Test environments may use clearly labeled small fixtures solely for automated tests.

## Imported Nigeria boundary release

The local development and dedicated integration-test databases currently contain
the versioned Nigeria release supplied for CivicPulse routing:

- geoBoundaries / GRID3 ADM1 (states + FCT): 37 features;
- geoBoundaries / GRID3 ADM2 (local government areas): 774 features;
- release commit: `9469f09`;
- effective boundary vintage: 2022;
- license: Creative Commons Attribution 4.0 International (CC BY 4.0);
- source: [ADM1 GeoJSON](https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM1/geoBoundaries-NGA-ADM1.geojson) and [ADM2 GeoJSON](https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/NGA/ADM2/geoBoundaries-NGA-ADM2.geojson).

The repeatable importer is `npm run db:import:nigeria --workspace=@civicpulse/server -- --apply`.
It refuses partial downloads, unsupported or invalid geometries, and ambiguous
LGA-to-state containment. Re-running it updates the same source/type/code rows,
rebuilds the Nigeria country union, and appends a provenance audit record. Use
`--allow-test` only when deliberately targeting `TEST_DATABASE_URL`.

When the data is displayed or redistributed, attribute the geoBoundaries project
and retain the CC BY 4.0 notice. This release is a routing reference, not a
claim that administrative boundaries or agency mandates are legally current;
review and import a newer version when the boundary authority publishes one.

---

# 9. Government/NGO seed/onboarding

Do not ship fake agencies as if they were verified production organizations.

Production organization records should enter via:

- organization onboarding + CivicPulse admin verification; or
- a controlled import prepared from official source data and reviewed by admin.

Developer/test databases may contain obviously test-only organizations for automated flows.

---

# 10. Local development flow

Codex must provide exact working commands based on the final repository. Expected shape:

```text
npm install

# start Postgres/PostGIS
# e.g. docker compose up -d db

npm run db:migrate

# terminal 1
npm run dev:api

# terminal 2
npm run dev:worker

# terminal 3
npm run dev:web
```

Then open the Vite URL.

A root `npm run dev` may use a lightweight process runner to start all three, but individual commands must remain available for debugging.

---

# 11. Production deployment shape

Simple deployment:

```text
Static/edge host
React/Vite build
        │
        ▼
Express API service ───── Cloudinary
        │                 Gemini
        ▼
Managed PostgreSQL + PostGIS
        ▲
        │
Worker process
(same server codebase)
```

Possible hosting providers are intentionally not hard-coded. Use whatever provider the user chooses, provided it can:

- host static Vite output;
- run long-lived Node processes for API/worker;
- connect securely to PostgreSQL;
- provide HTTPS/domains/secrets.

No Kubernetes requirement.

---

# 12. Production startup checks

API startup should validate required configuration.

At minimum:

- DATABASE_URL present/connection succeeds;
- required session secret present;
- Cloudinary credentials present if media feature enabled;
- Gemini key present if processing feature enabled;
- allowed frontend origin configured;
- production cookies/HTTPS settings safe.

Do not silently swap to fake services when a secret is missing.

---

# 13. Health/readiness

`GET /health`:

- process alive;
- database connectivity.

Do not call Gemini/Cloudinary on every health check.

Worker should log startup and task registration and expose process health through hosting platform/logging; an admin jobs view should show failed processing records/jobs.

---

# 14. Backups

Database:

- use managed automated backups where available;
- enable point-in-time recovery for serious production usage where provider supports it;
- test restore procedure periodically.

Cloudinary:

- understand account retention/backup policy;
- evidence deletion must follow CivicPulse policy and legal/privacy requirements.

Do not claim a backup strategy is complete until restore has been tested.

---

# 15. Logs and error reporting

Minimum:

- structured API logs;
- structured worker logs;
- request/job/report/incident IDs;
- error stack on server logs, not client;
- optional Sentry or equivalent if configured.

Do not add a large observability stack before needed.

---

# 16. Release procedure

Before production release:

1. clean install;
2. typecheck;
3. lint;
4. unit tests;
5. integration tests with real Postgres/PostGIS;
6. production frontend build;
7. production backend build;
8. migrations on fresh test DB;
9. worker test;
10. real Cloudinary contract test;
11. real Gemini contract tests for configured media paths;
12. Playwright end-to-end suite;
13. full interactive browser pass;
14. security/privacy review;
15. deploy staging;
16. smoke test staging;
17. backup/rollback plan confirmed;
18. production deploy.

Anything that cannot be tested due missing credentials/data must be written in final handoff as BLOCKED/UNVERIFIED.

---

# 17. Operational failure handling

Keep the playbook simple.

## Gemini outage

- Graphile Worker retries transient errors with sensible backoff.
- report remains PROCESSING/FAILED_RETRYABLE rather than fake-processed.
- admin can see/retry permanent failures.

## Cloudinary upload failure

- frontend shows recoverable upload error;
- report draft remains editable;
- do not save unverified asset reference.

## Worker offline

- jobs remain in PostgreSQL;
- once worker restarts, work resumes according to Graphile Worker behavior.

## Database outage

- API returns controlled service-unavailable errors;
- do not accept actions that cannot be durably stored.

## Boundary/jurisdiction unresolved

- report/incident moves to routing/jurisdiction review;
- never guess a government body.

---

# 18. Final handoff required from Codex

At completion Codex must document:

- architecture actually implemented;
- all environment variables;
- where each credential comes from;
- exact local commands;
- exact database migration commands;
- Cloudinary setup;
- Gemini setup;
- chosen map/geocoder setup;
- boundary-data import;
- government/NGO onboarding;
- test commands;
- real-provider test commands;
- deployment steps;
- staging/production verification;
- known limitations;
- anything still blocked/unverified.
