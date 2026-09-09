# CivicPulse Technical Specifications

**Version:** 2.0 — Simplified production architecture  
**Frontend:** React + Vite + TypeScript  
**Backend:** Express + TypeScript  
**Database:** PostgreSQL + PostGIS  
**Background work:** Graphile Worker on PostgreSQL  
**Media:** Cloudinary  
**AI:** Gemini

---

# 1. Engineering objective

Build CivicPulse as a production-capable modular web application without unnecessary infrastructure. The system must support citizens, government organizations, NGOs and CivicPulse administrators, but should remain understandable to a small engineering team.

The architecture should solve actual requirements, not hypothetical scale problems.

The default rule is:

> Add a component only when CivicPulse has a real responsibility that cannot be handled cleanly by the existing components.

---

# 2. Architecture

```text
Browser
React + Vite + TypeScript
        │
        │ HTTPS REST JSON
        ▼
Express + TypeScript API
        │
        ├──────────────► Cloudinary
        │                 signed media upload/storage
        │
        ├──────────────► Gemini API
        │                 text/image/audio/video understanding
        │                 (normally called by worker)
        │
        ▼
PostgreSQL + PostGIS
        │
        └──────────────► Graphile Worker
                          background jobs in PostgreSQL
```

The API and worker are two entry points in the same backend project. They share domain code, database code, validation schemas and provider clients.

They may run:

- in one process during simple local development; and
- as separate processes in production when background work should scale independently.

This is not a microservice architecture.

---

# 3. Technology choices

## 3.1 Frontend

- React.
- Vite.
- TypeScript with strict mode.
- React Router for routes.
- TanStack Query for fetching/caching/mutations.
- Tailwind CSS for styling.
- Lucide React for icons, consistent with `docs/design.md`.
- React Hook Form + Zod resolver for complex forms where useful.
- Playwright for browser E2E.

Do not introduce Redux/Zustand unless local/context/query state becomes demonstrably insufficient.

Vite transpiles TypeScript but does not itself type-check it, so CI/build scripts must run `tsc --noEmit` as a separate check.

## 3.2 Backend

- Express 5.
- TypeScript strict mode.
- Zod request validation.
- `pg` / node-postgres.
- parameterized SQL only; never interpolate untrusted values into SQL.
- versioned SQL migrations.
- Graphile Worker for long-running/retryable tasks.
- official Cloudinary Node SDK.
- official `@google/genai` SDK.
- Supertest for HTTP/API integration tests.

Use thin route handlers. Business logic lives in domain/service modules, not inside route callbacks.

## 3.3 Database

PostgreSQL is the source of truth.

PostGIS is required for:

- report/incident locations;
- LGA/state/federal boundaries;
- point-in-polygon jurisdiction lookup;
- distance/proximity searches;
- nearby incident candidate selection.

No pgvector in the initial architecture.

## 3.4 Background jobs

Use Graphile Worker because it runs on PostgreSQL. CivicPulse does not need Redis/BullMQ simply to process Gemini jobs.

Initial tasks:

- `process-report`
- `retry-report-processing` only if required by job policy rather than a separate custom queue
- `send-email`
- optional `recalculate-incident-summary` when an incident receives meaningful new evidence

Do not create one queue/task for every tiny step. A single `process-report` task may orchestrate a normal processing pipeline with explicit database checkpoints.

---

# 4. Repository/runtime topology

Recommended workspace:

```text
civicpulse/
├── apps/
│   ├── web/                    # React/Vite app
│   └── server/                 # Express API + worker
├── packages/
│   └── shared/                 # types/constants safe for both apps
├── docs/
│   ├── design.md
│   └── ...
├── package.json                # npm workspaces
└── README.md
```

Server entry points:

```text
apps/server/src/http.ts          # starts Express
apps/server/src/worker.ts        # starts Graphile Worker
```

Do not create additional deployable services unless a later measured requirement justifies them.

---

# 5. Database design

Exact column names may evolve, but the following concepts are required.

## 5.1 Identity/auth

### users

- id UUID
- email unique nullable only if another verified auth path is explicitly supported
- password_hash
- display_name
- account_status
- email_verified_at
- created_at
- updated_at

### sessions

Prefer opaque server-side sessions over a complicated JWT refresh-token system.

- id UUID
- user_id
- token_hash
- expires_at
- created_at
- last_seen_at
- revoked_at
- user_agent optional
- ip metadata optional and privacy-limited

Cookie must be HttpOnly, Secure in production and SameSite appropriate to deployment topology.

### verification_tokens / password_reset_tokens

Store hashed token values with expiry and consumed timestamps.

## 5.2 Organization model

### organizations

Represents government bodies and NGOs.

Core fields:

- id
- kind: GOVERNMENT | NGO
- official_name
- acronym
- logo_cloudinary_public_id / asset reference
- description
- website
- official_email
- phone
- address
- verification_status
- verification_notes
- created_at / updated_at

### organization_members

- organization_id
- user_id
- role
- membership_status
- invited_by
- joined_at

### government_profiles

- organization_id
- government_level: FEDERAL | STATE | LGA
- organization_type
- parent_organization_id nullable
- supervising_organization_id nullable
- mandate_summary
- responsibilities text/JSON
- exclusions text/JSON
- issue_categories text/JSON
- asset_types text/JSON
- ownership_roles text/JSON
- operational_scope notes

### organization_mandate_sources

Every important mandate claim should be traceable.

- id
- organization_id
- source_type
- title
- source_url
- document_asset_id nullable
- effective_date nullable
- notes
- verified_by_admin_id
- verified_at

### ngo_profiles

Include the fields defined in `06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md`, including legal registration, focus areas, geographical scope, funding/execution capability and technical capacity.

## 5.3 Geography

### jurisdictions

- id
- name
- type: COUNTRY | STATE | LGA | WARD if supported
- parent_id
- official_code nullable
- boundary geometry(MultiPolygon, 4326)
- source
- effective_from/to nullable
- active

Use a GIST spatial index on boundary.

### organization_jurisdictions

Maps organization to jurisdiction(s) it serves.

### assets

Optional but important where ownership is known.

- id
- name
- asset_type
- geometry (Point/LineString/Polygon as appropriate)
- jurisdiction_id
- ownership_level
- owner_organization_id nullable
- managing_organization_id nullable
- source
- verified

Do not block the entire product on complete national asset data. Absence of asset ownership should reduce routing confidence and may trigger review.

## 5.4 Reports and media

### reports

A report is one citizen submission.

- id
- reporter_user_id
- original_text nullable
- latitude / longitude represented as PostGIS point
- location_accuracy_meters nullable
- user_confirmed_location boolean
- typed_location nullable
- status: DRAFT | SUBMITTED | PROCESSING | PROCESSED | NEEDS_REVIEW | FAILED
- visibility policy
- created_at / submitted_at / processed_at

### report_media

- id
- report_id
- cloudinary_public_id
- cloudinary_asset_id if available
- resource_type
- format
- bytes
- width/height/duration where available
- original_filename sanitized/optional
- mime_type
- visibility
- upload_verified_at
- created_at

Do not store Cloudinary API secrets or signed delivery URLs in the database.

### report_analysis

Preserve both original-language interpretation and normalized output.

- report_id
- detected_language
- language_confidence nullable
- original_transcript nullable
- english_transcript nullable
- title
- summary
- full_description
- has_civic_issue
- category
- subcategory
- affected_assets JSON
- observations JSON
- urgency_signals JSON
- location_mentions JSON
- model_name
- raw structured response only if privacy policy permits; otherwise retain necessary fields
- analysis_version
- created_at

AI output must be schema-validated before persistence.

## 5.5 Incidents

### incidents

- id
- public_reference e.g. CP-2026-...
- title
- summary
- category/subcategory
- location geometry(Point,4326)
- jurisdiction ids / resolved hierarchy
- official_status
- community_verification_status
- priority fields
- first_reported_at
- last_reported_at
- report_count
- public_visibility
- created_at / updated_at

### incident_reports

Join table from reports to incident.

Store matching method/confidence and whether an admin later changed the association.

### incident_merge_history

Needed because duplicate detection can be wrong. Admin can merge or split with audit trail.

## 5.6 Government responsibility

### incident_assignments

- incident_id
- organization_id
- role: PRIMARY | SUPPORTING
- routing_confidence
- routing_reason
- routing_method: AI | MANUAL
- status
- assigned_at
- reviewed_at
- reviewed_by

### routing_decisions

Keep the candidate list and rationale needed to audit an AI decision without exposing private chain-of-thought.

- incident_id
- candidate organization IDs
- selected IDs
- concise reasons
- confidence
- missing_information
- model/version
- created_at

Never store or request private model chain-of-thought. Store concise externally useful rationale only.

## 5.7 Government workflow/timeline

### incident_updates

- incident_id
- author organization/user
- type
- body
- attachments
- public/private visibility
- created_at

### incident_status_history

- incident_id
- from_status
- to_status
- changed_by_user_id
- organization_id nullable
- reason
- created_at

Never silently overwrite meaningful status history.

## 5.8 Public social layer

### incident_reactions

One reaction per user per target according to product rules.

### affected_confirmations

Represents stronger “I am affected” signal separately from ordinary voting.

### incident_comments

- author
- body
- parent_comment_id nullable
- moderation_status
- created_at/edited_at

### incident_follows

Unique incident/user pair.

### resolution_verifications

Citizens may confirm or dispute a government resolution according to eligibility/rules.

## 5.9 NGO interventions

Use entities from `06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md`:

- intervention_expressions_of_interest
- intervention_proposals
- intervention_participants
- intervention_approvals
- intervention_milestones
- intervention_evidence
- intervention_completion_submissions
- intervention_handover

## 5.10 Audit/moderation

- audit_logs
- moderation_reports
- moderation_actions
- admin_notes where necessary

Audit entries should capture meaningful privileged actions, not every harmless page view.

---

# 6. Cloudinary media flow — no webhook

## 6.1 Upload initiation

Frontend calls:

`POST /api/media/sign-upload`

Request includes intended:

- media kind;
- report draft ID;
- MIME type;
- size where known.

Backend:

1. authenticates user;
2. validates allowed file type/size;
3. chooses a controlled Cloudinary folder/public ID strategy;
4. creates short-lived signed upload parameters with the Cloudinary Node SDK;
5. returns only values safe for browser use.

Never send `CLOUDINARY_API_SECRET` to the browser.

## 6.2 Direct upload

Browser uploads directly to Cloudinary using the signed parameters.

The Express server does not proxy large audio/video files.

## 6.3 Completion/verification

Browser sends the Cloudinary returned asset identifiers to Express.

Express must verify that the asset really exists and matches the expected upload context before associating it with the report. Use the official Cloudinary SDK/resource lookup or supported response verification mechanism.

If verification fails, do not accept the media reference.

## 6.4 Access

Original evidence should default to restricted/authenticated delivery where practical. The backend decides whether a requester is allowed to receive a signed delivery URL.

A media item may have a public visibility flag, but public exposure should still respect moderation/privacy rules.

---

# 7. Report submission flow

```text
Citizen creates draft
  ↓
adds text/media
  ↓
gets device GPS or selects map pin
  ↓
confirms location
  ↓
media already uploaded directly to Cloudinary
  ↓
POST /reports/:id/submit
  ↓
Express validates everything
  ↓
PostgreSQL transaction:
  - mark report SUBMITTED/PROCESSING
  - persist verified media refs/location
  - add Graphile Worker process-report job
  ↓
return 202 / report received
```

Where possible, enqueue the Graphile Worker job in the same PostgreSQL transactional context supported by the chosen Graphile Worker API. This gives reliability without adding a separate outbox subsystem.

---

# 8. Background report processing

The `process-report` worker should be idempotent: rerunning it for the same report must not create duplicate incidents/assignments.

Recommended stages:

1. lock/read report and verify it still needs processing;
2. prepare media for Gemini;
3. run Gemini analysis;
4. validate structured result;
5. persist report analysis;
6. resolve jurisdiction using PostGIS;
7. find candidate existing incidents;
8. decide attach-vs-new;
9. create/update incident;
10. build eligible government candidate organizations;
11. run AI responsibility routing;
12. persist assignments and routing rationale;
13. update processing status;
14. create relevant public timeline/system activity;
15. notify reporter/followers when appropriate.

On failure, store a safe failure code/message and let Graphile Worker retries handle transient failures. Permanent/validation failures should become `NEEDS_REVIEW` or `FAILED`, visible to admins.

---

# 9. Gemini integration

## 9.1 What Gemini does

Gemini may:

- detect spoken/written language;
- transcribe voice/video speech;
- translate/normalize to English;
- understand image/video evidence;
- determine whether a civic issue is present;
- extract title/summary/category/subcategory;
- identify affected asset types and observable facts;
- compare a new report with nearby incident candidates;
- select responsible government organizations from a constrained candidate list;
- assist moderation where enabled.

## 9.2 What Gemini must not invent

Gemini does not authoritatively determine:

- GPS coordinates;
- geographic boundaries;
- LGA/state membership;
- identity of an organization not supplied as candidate;
- official status changes;
- permissions;
- government approval;
- legal authorization to commence infrastructure work.

## 9.3 Languages

Initial target languages:

- English
- Yoruba
- Hausa
- Igbo
- Nigerian Pidgin
- OTHER/UNKNOWN fallback

Do not force the user to pick a language before recording.

Output should preserve:

- detected language;
- original transcript where audio/video contains speech;
- normalized English transcript;
- confidence/uncertainty where available.

Never throw away the original submission.

## 9.4 Media input strategy

Cloudinary remains the permanent media store. Gemini is the processor, not the source of record.

Worker obtains authorized media from Cloudinary and then uses the appropriate current Gemini input path:

- small images/audio/video may be sent inline if within current limits;
- larger audio/video should use Gemini Files API according to current official limits/recommendations;
- do not hard-code stale size/model limits; verify official docs during implementation.

Clean up temporary local/Gemini files according to provider policy after processing.

## 9.5 Structured output

Use a Zod/JSON schema with the official SDK. Validate the response again in application code. A syntactically valid JSON response can still contain semantically invalid values.

Example conceptual shape:

```json
{
  "hasCivicIssue": true,
  "detectedLanguage": "Nigerian Pidgin",
  "originalTranscript": "...",
  "englishTranscript": "...",
  "title": "Blocked drainage causing flooding",
  "summary": "...",
  "category": "DRAINAGE",
  "subcategory": "BLOCKAGE",
  "affectedAssets": ["DRAINAGE_CHANNEL"],
  "observations": ["standing water visible"],
  "urgencySignals": ["homes may be affected"],
  "locationMentions": ["Kuto"]
}
```

---

# 10. Jurisdiction resolution

Device/user-confirmed coordinates are authoritative for geospatial routing.

PostGIS determines containment:

```text
Point
 ↓
LGA polygon
 ↓
State polygon
 ↓
Country/federal context
```

Use indexed point-in-polygon queries. If no boundary contains a point because data is missing/invalid/borderline, do not guess; mark jurisdiction review required.

Boundary datasets must include source/provenance and version/effective dates where available.

---

# 11. Duplicate report / incident matching — no vector database

Initial matching should be simple and explainable.

## 11.1 Candidate retrieval

Find a small candidate set using deterministic filters such as:

- open/recent incidents;
- same or compatible category;
- distance within category-specific radius;
- same affected asset where known;
- time relevance.

Use PostGIS `ST_DWithin` or equivalent indexed distance query.

## 11.2 AI comparison

Send only those candidate summaries/location distances/categories/evidence descriptors to Gemini and ask for structured decision:

- MATCH candidate incident ID;
- NEW incident;
- REVIEW_REQUIRED.

Gemini may return only candidate IDs supplied by the backend.

High-confidence match attaches the report. Ambiguous cases go to admin review. Admin must be able to merge/split later.

This avoids pgvector until measurements prove it is needed.

---

# 12. Government candidate generation and AI routing

## 12.1 Candidate set

For an incident in an LGA inside a state, build candidates from:

- verified relevant LGA organizations;
- verified relevant state organizations;
- verified federal organizations whose mandate can apply nationally/regionally;
- known asset owner/manager organizations where available.

Exclude:

- unverified/inactive organizations;
- organizations outside applicable jurisdiction unless mandate clearly crosses it;
- candidates lacking enough mandate information to reason about where avoidable.

## 12.2 Information supplied to Gemini

For each candidate include only curated data such as:

- organization ID;
- official name;
- government level;
- mandate;
- responsibilities;
- exclusions;
- relevant categories;
- asset responsibilities;
- jurisdiction;
- mandate-source snippets/metadata as appropriate.

Also include incident analysis, jurisdiction and known asset ownership.

## 12.3 Structured routing output

```json
{
  "primaryOrganizationId": "uuid-or-null",
  "supportingOrganizations": [
    { "organizationId": "uuid", "confidence": 0.78, "reason": "..." }
  ],
  "primaryConfidence": 0.91,
  "reason": "...",
  "reviewRequired": false,
  "missingInformation": []
}
```

Reject output containing an organization ID not in the candidate list.

Low confidence, close competing candidates or missing asset ownership should trigger human review rather than forced automation.

---

# 13. Feed architecture

Feed is incident-centric, not raw-report-centric.

Initial implementation does not need a separate feed service or search engine.

Query PostgreSQL with indexed filters.

Candidate sources:

- nearby incidents;
- followed incidents/categories/areas;
- recently updated incidents;
- high-severity incidents;
- local government updates;
- NGO intervention milestones/resolutions.

Ranking can be a transparent weighted function of:

- proximity;
- recency;
- severity/priority;
- follow relationship;
- meaningful updates;
- civic engagement.

Do not make ordinary upvotes the main severity score.

Use cursor pagination rather than large offsets when practical.

---

# 14. Public interactions

Support:

- upvote/downvote according to finalized UX terminology;
- “I’m affected”;
- “I can confirm this” where appropriate;
- comments/replies;
- follow/unfollow;
- add evidence;
- resolution confirmation/dispute.

Use database unique constraints to stop duplicate user actions instead of relying only on frontend state.

Votes and strong civic signals must be stored separately.

---

# 15. Government operations

Government users see incidents assigned to their verified organization.

Capabilities based on role:

- view incident/evidence;
- view routing rationale;
- acknowledge;
- move through permitted status transitions;
- add public/private updates;
- add investigation/resolution evidence;
- request routing review;
- coordinate supporting organizations;
- review NGO proposals;
- manage organization profile/mandate subject to admin review rules.

State transitions are enforced in Express service logic, never trusted from arbitrary client status strings.

---

# 16. NGO operations

NGO dashboard:

- discover/filter public eligible incidents;
- save/follow issues;
- express interest;
- choose intervention role: FUND, CO_FUND, EXECUTE, FUND_AND_EXECUTE, MATERIALS, TECHNICAL_ASSISTANCE, COMMUNITY_SUPPORT, MONITORING, ADVOCACY;
- submit proposal;
- answer revision requests;
- track approvals;
- submit milestones/evidence;
- submit completion/handover.

Physical public-infrastructure work may begin only after the competent authority records required authorization(s). CivicPulse represents the approval workflow; it does not invent legal permission.

---

# 17. Admin operations

CivicPulse admin dashboard must support:

- government organization verification;
- NGO verification;
- mandate/source review;
- organization hierarchy/jurisdiction assignment;
- boundary dataset management/import;
- asset registry management;
- low-confidence routing review/override;
- incident merge/split;
- moderation reports/actions;
- resolution disputes;
- intervention oversight;
- failed report-processing review/retry;
- audit-log review;
- taxonomy/config management.

Admin actions must be permission-protected and audited.

---

# 18. API shape

Use REST. Exact paths may evolve but keep them predictable.

Examples:

```text
/auth/register
/auth/login
/auth/logout
/auth/me
/auth/verify-email
/auth/forgot-password
/auth/reset-password

/media/sign-upload
/media/verify

/reports
/reports/:id
/reports/:id/submit
/reports/:id/add-evidence

/incidents
/incidents/:id
/incidents/:id/comments
/incidents/:id/reactions
/incidents/:id/follow
/incidents/:id/affected
/incidents/:id/resolution-verifications

/government/incidents
/government/incidents/:id/status
/government/incidents/:id/updates
/government/incidents/:id/routing-review

/organizations
/organizations/:id
/organizations/:id/members

/ngo/issues
/ngo/interventions
/ngo/interventions/:id

/admin/organizations/...
/admin/routing/...
/admin/incidents/...
/admin/moderation/...
/admin/jobs/...
```

Use consistent response/error envelope and HTTP status codes. Do not leak stack traces/internal provider errors to clients.

---

# 19. Validation and errors

All external boundaries require validation:

- HTTP request body/query/params;
- Cloudinary upload metadata;
- Gemini structured output;
- Graphile Worker payloads;
- GeoJSON/boundary imports;
- CSV/organization imports if supported.

Return stable machine-readable error codes plus human-readable messages.

Examples:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `MEDIA_VERIFICATION_FAILED`
- `REPORT_ALREADY_SUBMITTED`
- `LOCATION_REQUIRED`
- `JURISDICTION_UNRESOLVED`
- `ROUTING_REVIEW_REQUIRED`
- `INVALID_STATUS_TRANSITION`
- `INTERVENTION_NOT_AUTHORIZED`

---

# 20. Idempotency/concurrency without heavy infrastructure

Use simple database mechanisms:

- unique constraints;
- transactions;
- row locks where truly required;
- Graphile Worker job keys where useful;
- idempotency keys for vulnerable POST actions such as report submission or payment-like future operations;
- `ON CONFLICT` for reactions/follows;
- optimistic checks for edits/status updates if concurrent changes matter.

Do not add a transactional outbox framework. If a workflow can create the job transactionally in PostgreSQL through Graphile Worker, use that. Otherwise use a clear status and retryable operation.

---

# 21. Security baseline

- HTTPS in production.
- Passwords hashed with Argon2id or another current recommended password-hashing configuration.
- opaque session cookies stored/validated server side.
- rate-limit login/register/report/comment routes.
- strict CORS/origin allowlist.
- security headers via Helmet or equivalent.
- request body limits.
- explicit upload size/type limits.
- no secrets in frontend bundle.
- server-side permission checks on every protected route.
- signed Cloudinary uploads only.
- private/restricted evidence delivery where required.
- safe HTML/text rendering to prevent XSS.
- SQL parameterization.
- audit privileged actions.

See `08_SECURITY_PRIVACY_MODERATION_AND_AUDIT.md`.

---

# 22. Observability without an observability platform zoo

Start with:

- structured JSON application logs;
- request ID per HTTP request;
- log level/environment;
- error tracking provider if configured (e.g. Sentry) but do not require multiple observability vendors;
- `/health` endpoint checking process and DB connectivity;
- worker logs for job start/success/failure/retry;
- admin failed-processing view from database/job state.

Never log passwords, session tokens, Cloudinary secrets, Gemini API keys, full private media URLs or unnecessary personal information.

---

# 23. Testing

Required layers:

1. unit tests for pure business rules;
2. API integration tests against real test PostgreSQL/PostGIS;
3. worker integration tests;
4. provider contract tests using real Cloudinary/Gemini test credentials when available;
5. Playwright browser E2E through the actual frontend/API/database;
6. final manual/agent browser interaction pass exercising every reachable active control.

A provider test that cannot run because credentials are missing is `BLOCKED`, not passed using a fake provider.

See `07_TESTING_ACCEPTANCE_AND_EDGE_CASES.md`.

---

# 24. Scaling plan

Do not pre-build the scale architecture.

Scale in this order when measurements demand it:

1. add proper DB indexes / optimize slow SQL;
2. add connection pooling/managed Postgres tuning;
3. run more Express instances;
4. run more Graphile Worker instances/concurrency;
5. cache only demonstrated hot read paths;
6. add dedicated search/vector infrastructure only if PostgreSQL/Gemini candidate matching no longer meets requirements;
7. split services only when a domain has a genuine independent scaling, ownership or reliability need.

The initial architecture can support meaningful real usage without unnecessary operational burden.

---

# 25. Explicitly removed complexity

The following were present in an earlier architecture and are intentionally removed:

## Cloudinary webhook

Not needed. Client completes signed upload and backend verifies the asset before associating it.

## Redis/BullMQ

Not needed. Graphile Worker uses PostgreSQL for background jobs.

## Transactional outbox

Not needed as a separate subsystem. Use PostgreSQL transaction/job enqueue semantics and job idempotency.

## pgvector

Not needed initially. PostGIS narrows duplicate candidates; Gemini compares the small candidate set.

## NestJS

Not used. Backend is Express + TypeScript.

## Next.js

Not used. Frontend is React + Vite.

## Microservices

Not used. One web app and one backend codebase with an HTTP process and worker process.

---

# 26. Final implementation rule

If Codex wants to add a new infrastructure dependency, it must first answer:

1. What concrete CivicPulse requirement cannot be solved cleanly with the current stack?
2. What production failure occurs without this dependency?
3. Is there a simpler solution using PostgreSQL/Express/React/current providers?
4. What additional deployment/monitoring burden does it introduce?

If there is no strong answer, do not add it.
