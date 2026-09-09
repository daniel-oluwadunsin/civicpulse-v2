# CivicPulse Ordered Codex Build Prompts — Simplified Stack

Use these prompts in order in the **same Codex conversation**. Each later prompt assumes the previous phases are complete.

Before Prompt 0, put all bundle documents inside the repository, including `docs/design.md`.

Do not give all staged prompts at once unless you intentionally choose the one-shot mode in `10_ONE_SHOT_CODEX_PROMPT.md`.

---

# Prompt 0 — Senior engineering kickoff and repository audit

You are the senior engineer responsible for building CivicPulse into a real production application.

Before changing code, read every CivicPulse handoff document available in the repository, especially:

- `01_PRD.md`
- `02_TECHNICAL_SPECIFICATIONS.md`
- `03_PROJECT_STRUCTURE_AND_STANDARDS.md`
- `docs/design.md`
- `05_ENV_SETUP_DEPLOYMENT_AND_OPERATIONS.md`
- `06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md`
- `07_TESTING_ACCEPTANCE_AND_EDGE_CASES.md`
- `08_SECURITY_PRIVACY_MODERATION_AND_AUDIT.md`

Then inspect the repository fully.

Important architecture decision already made by the user:

- frontend: React + Vite + TypeScript;
- backend: Express 5 + TypeScript;
- database: PostgreSQL + PostGIS;
- database access: node-postgres (`pg`) + parameterized SQL/versioned SQL migrations;
- background processing: Graphile Worker using the same PostgreSQL database;
- media: Cloudinary signed direct browser uploads;
- AI: Gemini;
- no NestJS;
- no Next.js;
- no Redis/BullMQ;
- no Cloudinary webhook;
- no pgvector;
- no transactional outbox;
- no microservices.

Do not add complexity merely because it is common in large-system architecture diagrams.

Tasks:

1. inventory existing code/files/dependencies;
2. identify anything that conflicts with the canonical stack;
3. determine whether this is a clean build or migration;
4. identify unresolved external choices that truly block implementation, e.g. map/geocoding provider if none is specified;
5. propose the concrete implementation order matching the documents;
6. preserve useful existing code and `docs/design.md`;
7. do not write speculative infrastructure.

If a genuine product/provider decision is required and cannot be inferred from the documents, ask the user a focused question at that point. Do not ask questions whose answers are already in the documents.

Do not implement the whole application in this first prompt. Finish with the audit and immediate next implementation plan.

---

# Prompt 1 — Workspace, frontend/backend foundation and design system

Implement the foundation.

Requirements:

- npm workspaces;
- `apps/web` React/Vite/TypeScript;
- `apps/server` Express/TypeScript;
- `packages/shared` only if genuinely useful;
- Node 22-compatible configuration;
- TypeScript strict mode;
- ESLint/formatting according to repo conventions;
- Express error handler, request ID, Helmet/security baseline, CORS config, JSON body limits;
- `GET /health`;
- frontend React Router shell;
- TanStack Query setup;
- Tailwind setup;
- implement design tokens/primitives from `docs/design.md` rather than generic defaults;
- global paper-grain texture, typography, focus states and responsive foundation from the design file;
- initial route shells for public/citizen/government/NGO/admin areas, without fake data.

Scripts must include separate typecheck/build/test commands. Vite production build must not be treated as TypeScript typechecking.

Do not create fake APIs to populate pages.

Run typecheck/build/tests for the foundation and report exact results.

---

# Prompt 2 — PostgreSQL/PostGIS, migrations, authentication and authorization

Implement the real data foundation.

Requirements:

- PostgreSQL connection pool using `pg`;
- PostGIS extension migration;
- versioned SQL migrations and migration runner;
- users, sessions, verification/reset tokens;
- organizations/memberships foundation;
- opaque server-side sessions in PostgreSQL;
- secure HttpOnly cookie;
- password hashing with current Argon2id guidance;
- register/login/logout/me;
- email verification and password reset using real configured SMTP integration; if SMTP credentials are unavailable, implement integration/configuration but report real send test as BLOCKED rather than faking success;
- server-side permission middleware/helpers;
- frontend auth flows and protected routing;
- role-aware navigation without relying on frontend for authorization.

Create integration tests against a real test Postgres/PostGIS database.

Do not introduce JWT refresh-token complexity unless a documented requirement demands it.

---

# Prompt 3 — Government and NGO onboarding + CivicPulse verification admin

Implement organization onboarding completely using `06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md`.

Government must collect enough data for AI responsibility routing, including:

- official/legal name;
- acronym;
- logo;
- government level;
- organization type;
- parent/supervising organizations;
- jurisdictions;
- mandate;
- responsibilities;
- exclusions;
- categories;
- asset responsibilities/ownership roles;
- official source links/documents;
- official/operational contacts.

NGO must collect legal registration, logo, focus areas, geographic reach, capabilities, contacts, project history/supporting docs and other required fields from the handoff.

Build:

- save/resume onboarding where helpful;
- submission states;
- CivicPulse admin verification queue;
- approve/reject/request-changes;
- verified badges/status;
- membership/invite controls required for initial release;
- audit of verification actions.

Respect `docs/design.md`; onboarding should be easy rather than a giant intimidating form.

Do not seed fake production organizations.

Test all onboarding/admin approval paths.

---

# Prompt 4 — Cloudinary media + citizen report creation UX

Implement report creation and media using real Cloudinary integration.

Cloudinary flow:

1. browser asks Express for signed upload parameters;
2. Express validates intended type/size/user/report draft;
3. browser uploads directly to Cloudinary;
4. browser receives Cloudinary result;
5. browser sends asset reference to Express;
6. Express verifies asset with Cloudinary before accepting it.

There is no webhook.

Support:

- text;
- image;
- voice/audio;
- video;
- multiple compatible evidence items according to sensible configured limits;
- device geolocation;
- manual map pin confirmation/adjustment;
- graceful location permission denial;
- draft state;
- remove/retry upload;
- submission confirmation.

If map/geocoding provider is unresolved, ask the user before hard-coding a provider decision.

The citizen should not need to choose category/department/language manually.

Build responsive, accessible report UX using `docs/design.md`.

Run real Cloudinary contract test if credentials are available; otherwise mark BLOCKED.

---

# Prompt 5 — Graphile Worker + Gemini multimodal report processing

Implement the asynchronous processing path.

Use Graphile Worker backed by the same PostgreSQL database. Do not add Redis/BullMQ/outbox.

Create a real `process-report` task.

Report submission should durably save the report and enqueue processing using PostgreSQL/Graphile Worker semantics. API should return quickly.

Gemini must process text/image/audio/video as applicable and return validated structured output:

- has civic issue;
- detected language;
- original transcript;
- English normalized transcript;
- title;
- summary;
- full description;
- category/subcategory;
- affected assets;
- observations;
- urgency signals;
- location mentions.

Target automatic recognition of English, Yoruba, Hausa, Igbo and Nigerian Pidgin, with OTHER/UNKNOWN fallback.

Preserve original content. Do not force language selection.

Use current official Gemini docs/SDK. For Cloudinary media, securely obtain the file and use the current appropriate Gemini inline/File API path. Do not hard-code stale provider limits.

Implement retries/status/failure reporting and idempotency.

Test real configured provider paths when credentials are available. Never replace a failed provider with a fake response.
For the gemini, due to ratelimiting and all, remember we want to build this project and push to prod with entirely free stuff, so i will have multiple GEMINI keys that you will fallback to in the .env when rate limited, like GEMINI_API_KEY_1, GEMINI_API_KEY_2, e.t.c

---

# Prompt 6 — PostGIS jurisdiction, incident matching and AI government responsibility routing

Implement the intelligence/routing core.

## Jurisdiction

- load/import jurisdiction boundaries from controlled data;
- store source/provenance;
- GIST indexes;
- resolve coordinates deterministically to LGA/state/federal hierarchy using PostGIS;
- unresolved/border cases go to review, not Gemini guessing.

## Report -> Incident

No pgvector.

Candidate retrieval:

- nearby via PostGIS;
- compatible category;
- relevant status/time;
- known asset if available.

Then give only a small candidate set to Gemini and ask MATCH / NEW / REVIEW_REQUIRED with supplied IDs only.

Implement merge/split correction support.

## Government routing

Build candidate organizations from verified LGA/state/federal organizations plus known asset owner/manager.

Give Gemini the incident + jurisdiction + candidate mandate/responsibility/exclusion data.

Require structured output:

- primary organization;
- supporting organizations;
- confidence;
- concise rationale;
- missing information;
- review flag.

Reject unknown organization IDs.

Low confidence/ambiguity => admin routing review.

Implement admin review/override with audit trail.

Create integration/AI contract tests for representative routing scenarios.

---

# Prompt 7 — Public incident feed, incident pages and citizen participation

Implement CivicPulse's transparency surface.

Feed is incident-centric.

Build:

- For You;
- Nearby;
- Following;
- useful category/area filters;
- cursor pagination;
- incident cards;
- incident detail/public timeline;
- evidence gallery with privacy rules;
- upvote/downvote according to final copy;
- `I'm affected` as separate stronger signal;
- confirmation/add-evidence flow;
- comments/replies;
- follow/unfollow;
- verified Government/NGO badges;
- report abuse/moderation action.

Feed personalization should use location/area/follows/relevance, not sensitive demographic profiling.

Popularity must not determine severity by itself.

Use normal PostgreSQL queries/indexes. Do not add Elasticsearch/vector DB.

Test duplicate interactions and unauthorized access.

---

# Prompt 8 — Government operations, public updates and resolution transparency

Implement the complete government dashboard.

Government users can:

- view/filter assigned incidents;
- inspect citizen evidence/report aggregation;
- inspect AI routing rationale;
- acknowledge;
- transition through valid workflow states;
- publish official updates;
- upload inspection/progress/resolution evidence;
- request routing review;
- coordinate primary/supporting organizations;
- see history;
- submit resolution.

Enforce transitions and permissions on Express.

Every meaningful update/status action should appear in the incident timeline according to visibility.

Implement separate community resolution verification:

- confirm resolved;
- dispute resolution;
- public display can truthfully show official RESOLVED while community verification is DISPUTED;
- government/admin follow-up path.

Test across officer/manager/other-organization/citizen roles.

---

# Prompt 9 — NGO issue discovery and intervention lifecycle

Implement NGO dashboard and intervention workflow from `06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md`.

Build:

- discover/filter issues;
- express interest;
- intervention types: FUND, CO_FUND, EXECUTE, FUND_AND_EXECUTE, MATERIALS, TECHNICAL_ASSISTANCE, COMMUNITY_SUPPORT, MONITORING, ADVOCACY;
- proposal form/documents;
- government review;
- request changes/resubmit;
- approve in principle;
- required approvals;
- authorized to commence;
- milestones/evidence;
- completion submission;
- government inspection/acceptance;
- handover;
- public timeline events.

An NGO cannot unilaterally “claim” a public asset or set itself authorized.

Physical work cannot move to commencement unless competent government approval requirements represented by the system are satisfied.

Test full lifecycle and invalid transitions.

---

# Prompt 10 — CivicPulse admin, moderation, notifications and transparency metrics

Complete platform administration.

Admin capabilities:

- organization verification;
- mandate/source review;
- memberships/escalations where appropriate;
- boundary/asset management;
- routing review/override;
- merge/split;
- moderation queue/actions;
- resolution disputes;
- intervention oversight;
- failed report processing review/retry;
- audit log;
- taxonomy/configuration.

Add notifications needed for core flows using real SMTP/in-app notifications. Keep notification architecture simple; do not add a message broker.

Add useful transparent government/org metrics such as counts, acknowledgement/resolution timing and community resolution confirmation where data supports them. Do not invent opaque civic scores.

Test permission boundaries thoroughly.

---

# Prompt 11 — Production hardening, exhaustive browser testing and final handoff

Now treat CivicPulse as a release candidate, not a development demo.

Read `07_TESTING_ACCEPTANCE_AND_EDGE_CASES.md` and `08_SECURITY_PRIVACY_MODERATION_AND_AUDIT.md` again.

Perform:

- dependency/security review;
- typecheck;
- lint;
- all unit tests;
- API integration tests with real Postgres/PostGIS;
- worker integration tests;
- clean database migration test;
- production Vite build;
- production Express/worker build;
- real Cloudinary contract test with configured credentials;
- real Gemini contract tests for text/image/audio/video paths that credentials/account limits permit;
- Playwright full E2E;
- responsive/accessibility checks;
- failure-path tests;
- interactive browser pass.

## Mandatory route/action inventory

Create an inventory of every reachable page and active control by role. Then actually exercise all reachable active controls using browser automation/manual agent interaction. Click buttons, links, dropdowns, tabs, forms, uploads, votes, comments, follows, map actions, government actions, NGO actions, admin approvals/moderation/merge/split/retry actions, logout and destructive confirmations.

For core state-changing controls verify UI + network + database state + refresh persistence.

Inspect console and failed network requests.

Fix all defects encountered and rerun affected tests.

## No fake success

If Cloudinary/Gemini/SMTP/map credentials or production boundary data are absent, clearly report the affected test/integration as `BLOCKED/UNVERIFIED`. Do not install a mock provider or hard-code success to get green tests.

## Final handoff

Finish by explaining to the user:

1. what was implemented;
2. final architecture;
3. repository structure;
4. every environment variable and where to obtain it;
5. exact local setup;
6. database/PostGIS migration and boundary-data setup;
7. Cloudinary setup;
8. Gemini setup;
9. map/geocoder setup;
10. government/NGO onboarding setup;
11. exact commands for web/API/worker;
12. exact test commands;
13. real-provider test results;
14. routes/actions tested;
15. deployment steps;
16. production verification;
17. known limitations/blocked items;
18. whether any production blocker remains.

Do not say “production ready” while a known release blocker remains.
