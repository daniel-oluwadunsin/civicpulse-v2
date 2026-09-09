# CivicPulse — One-Shot Production Build Prompt for Codex

You are the senior engineer responsible for taking full ownership of building **CivicPulse** into a real, production-capable web application.

You are not building a hackathon mockup, UI prototype, fake demo, or disconnected collection of pages. You are building the actual product described below and in the repository documentation.

Work carefully, incrementally and professionally. You may implement the work internally in phases, but this is a **one-shot instruction**: continue through the full build without requiring the user to paste another implementation prompt after each normal phase.

Only interrupt the user when a genuine product/provider decision is unresolved and cannot safely be inferred from the documentation or existing repository. Do not ask questions whose answers are already present.

---

# 0. FIRST: READ BEFORE CODING

Before writing or changing code:

1. inspect the entire repository;
2. read every CivicPulse document in the repository;
3. especially read:
   - `01_PRD.md`;
   - `02_TECHNICAL_SPECIFICATIONS.md`;
   - `03_PROJECT_STRUCTURE_AND_STANDARDS.md`;
   - `docs/design.md`;
   - `05_ENV_SETUP_DEPLOYMENT_AND_OPERATIONS.md`;
   - `06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md`;
   - `07_TESTING_ACCEPTANCE_AND_EDGE_CASES.md`;
   - `08_SECURITY_PRIVACY_MODERATION_AND_AUDIT.md`;
   - `09_CODEX_SKILLS_MCP_AND_REFERENCE_SOURCES.md`.
4. build a complete mental model of the current codebase before modifying it;
5. preserve good existing code and conventions where they do not conflict with the canonical CivicPulse specification;
6. identify old/incorrect dependencies or architecture left from previous attempts and remove them cleanly if unused.

`docs/design.md` is the mandatory UI/UX design system for the **entire product**. Its generic instruction asking what part of the app should be redesigned is already answered: the entire CivicPulse application must use the provided design system. Do not pause to ask that again.

When a framework/provider/library detail may have changed, read its **current official documentation** before implementing it. Do not invent SDK methods, model IDs, size limits, parameters or security behavior from memory.

---

# 1. NON-NEGOTIABLE SIMPLIFIED TECHNICAL ARCHITECTURE

The user deliberately wants a simple architecture. Do not replace it with an enterprise architecture unless a concrete requirement proves that it cannot work.

Use:

## Frontend

- React.
- Vite.
- TypeScript.
- React Router.
- TanStack Query for API/server state.
- Tailwind CSS following `docs/design.md`.
- Lucide React icons where appropriate.
- React Hook Form + Zod for complex forms where useful.
- Playwright for browser E2E.

Do **not** use Next.js.

## Backend

- Express 5.
- TypeScript strict mode.
- Zod validation.
- PostgreSQL access with `pg` / node-postgres and parameterized SQL.
- versioned SQL migrations.
- Graphile Worker for background work using the same PostgreSQL database.
- official Cloudinary Node SDK.
- official Google Gen AI SDK (`@google/genai`) for Gemini.

Do **not** use NestJS.

## Database

- PostgreSQL.
- PostGIS.

Do not add pgvector initially.

## Background processing

Use Graphile Worker using PostgreSQL itself.

Do not add:

- Redis;
- BullMQ;
- RabbitMQ;
- Kafka;
- transactional outbox infrastructure.

Use PostgreSQL transactions, Graphile Worker job semantics, job keys/idempotency, unique constraints and explicit processing statuses.

## Media

Use Cloudinary.

Use **signed direct browser uploads**. The browser uploads media to Cloudinary directly after getting signed parameters from Express.

There is **no Cloudinary webhook** in the canonical architecture.

After a successful browser upload, the frontend sends the Cloudinary asset identifiers to Express. Express verifies the referenced asset with Cloudinary before trusting and associating it with a report.

Never expose the Cloudinary API secret in the browser.

## AI

Use Gemini for:

- multimodal civic report understanding;
- automatic language identification;
- transcription/translation;
- structured issue extraction;
- nearby incident comparison;
- government responsibility routing;
- optional moderation assistance.

## Architecture shape

```text
React + Vite
     │
     │ REST/JSON
     ▼
Express + TypeScript
     │
     ├──────── Cloudinary
     ├──────── Gemini
     │
     ▼
PostgreSQL + PostGIS
     │
     └──────── Graphile Worker jobs
```

The Express API and Graphile Worker are different entry points/processes from the **same backend codebase**, not separate microservices.

Do not add microservices, GraphQL, event sourcing, CQRS frameworks, Elasticsearch, Kubernetes, service meshes, or extra infrastructure because they sound scalable.

If you believe a new infrastructure dependency is unavoidable, stop and explain exactly what concrete requirement cannot be met with the chosen architecture before adding it.

---

# 2. PRODUCT YOU ARE BUILDING

CivicPulse is an AI-powered civic infrastructure reporting, government accountability and civil-society coordination platform for Nigeria.

A citizen should not need to know whether a problem belongs to an LGA department, state ministry, federal agency or another government body before reporting it.

The citizen reports what is wrong using natural language and evidence. CivicPulse understands it, determines where it happened, identifies the real-world incident, determines jurisdiction, reasons over verified government organization mandates and assigns the correct responsible organization(s).

The incident then becomes a public transparency record where citizens can track actions, government can respond, NGOs can offer intervention, and the community can verify whether a claimed resolution actually solved the problem.

The four user layers are:

1. Citizens.
2. Government organizations/officers.
3. NGOs/civil-society organizations.
4. CivicPulse administrators/moderators.

User experience must be simple for every layer, despite the complexity behind the scenes.

---

# 3. CORE PRODUCT INVARIANT: REPORT IS NOT INCIDENT

Never model one citizen report as automatically equal to one incident.

A **Report** is a citizen submission/evidence item.

An **Incident** is the real-world civic problem.

Example:

```text
Citizen A uploads pothole photo ─┐
Citizen B sends voice note ──────┼──► Incident: Kuto Road pothole
Citizen C sends video ───────────┘
```

The public feed should primarily show one incident, not three duplicate posts.

Store original reports independently and link them to the incident.

Admin must be able to correct wrong grouping through merge/split operations with audit history.

---

# 4. CITIZEN REPORTING EXPERIENCE

The citizen flow must be extremely simple.

A citizen can submit:

- text;
- image(s);
- audio/voice note;
- video;
- combinations allowed by sensible product limits.

The citizen should not be required to choose:

- the responsible government organization;
- government level;
- technical issue category;
- spoken language.

The user experience should be roughly:

```text
Report a problem
  ↓
Describe/type OR record/upload media
  ↓
Allow location OR choose/adjust map pin
  ↓
Preview
  ↓
Submit
  ↓
"Report received — we're analysing it"
```

Preserve drafts/recoverable uploads where practical.

If location permission is denied, allow the user to manually select a map point or otherwise supply the required location.

Do not let Gemini generate exact GPS coordinates.

---

# 5. LOCATION AND JURISDICTION

Exact coordinates must come from:

- browser/device geolocation; and/or
- user-confirmed map pin.

Typed location or AI-extracted place mentions may assist UX, but they are not authoritative coordinates.

Store geospatial points in PostGIS.

Load real jurisdiction polygons with provenance for:

- country/federal context;
- state;
- LGA;
- ward later if supported/data available.

Use deterministic PostGIS point-in-polygon queries to determine jurisdiction.

Never ask Gemini:

> “Which LGA does this coordinate belong to?”

If boundary data cannot confidently resolve the point, mark it for review instead of guessing.

If the map/geocoding provider is not already specified in repository/environment documentation, ask the user a focused question when you reach that integration. Do not silently choose an expensive provider.

PostGIS remains the authority for government jurisdiction regardless of map provider.

---

# 6. MEDIA / CLOUDINARY

Use Cloudinary instead of GCS or local disk as the persistent media store.

## Secure upload flow

1. authenticated frontend asks Express for signed Cloudinary upload parameters;
2. Express validates report draft, intended MIME type, size and permitted media kind;
3. Express generates a short-lived signature with controlled folder/public ID/upload parameters;
4. frontend uploads directly to Cloudinary;
5. Cloudinary returns asset information to browser;
6. browser sends asset IDs/metadata to Express;
7. Express verifies the Cloudinary asset before accepting it;
8. save only trusted asset metadata/reference.

Do not proxy large uploads through Express.

Do not create a Cloudinary webhook endpoint.

## Evidence privacy

Citizen media can reveal faces, children, plates, houses, documents and voices.

Default original evidence to restricted/authenticated delivery where practical. Generate authorized signed delivery URLs for users who are allowed to see it.

Public feed media must respect explicit visibility/moderation/privacy rules.

Do not store expiring delivery URLs as permanent database values.

---

# 7. BACKGROUND PROCESSING

A report containing media must not keep an HTTP request open while Gemini processes it.

Use Graphile Worker.

Report submission transaction should save the report and enqueue a `process-report` job using reliable PostgreSQL/Graphile Worker semantics.

Return quickly with a submitted/processing state.

The job should be idempotent. Running it again must not create duplicate incidents or duplicate assignments.

The `process-report` pipeline should:

1. load report + verified media;
2. mark/check processing state;
3. prepare authorized media input for Gemini;
4. call Gemini;
5. validate structured output;
6. save report analysis;
7. resolve jurisdiction through PostGIS;
8. retrieve nearby candidate incidents;
9. decide existing incident vs new incident vs review;
10. link/create incident;
11. retrieve eligible verified government candidates;
12. run responsibility routing;
13. save primary/supporting assignments;
14. create necessary public/system timeline activity;
15. update report/incident processing state;
16. trigger in-app/email notifications where required.

Transient provider failures should retry according to Graphile Worker policy. Permanent failures should remain visible as FAILED/NEEDS_REVIEW with admin retry capability.

Never fake processing success.

---

# 8. GEMINI REPORT ANALYSIS

Use the current official Gemini SDK and structured outputs.

Gemini must understand text/image/audio/video depending on submission.

Initial target languages:

- English;
- Yoruba;
- Hausa;
- Igbo;
- Nigerian Pidgin;
- OTHER/UNKNOWN fallback.

The user should not select language manually.

For audio/video, preserve:

- detected language;
- original-language transcript;
- English normalized translation/transcript;
- meaningful uncertainty/confidence if available.

Do not discard the original media/transcript.

Structured analysis should include at least:

```text
hasCivicIssue
detectedLanguage
originalTranscript
englishTranscript
title
summary
fullDescription
category
subcategory
affectedAssets[]
observations[]
urgencySignals[]
locationMentions[]
```

Use strict enums/schemas where CivicPulse taxonomies exist.

Validate the model response again in application code. Schema-valid JSON can still contain an invalid category/ID/value.

Do not request or persist hidden model chain-of-thought.

---

# 9. CLOUDINARY MEDIA -> GEMINI

Cloudinary is the source of stored evidence. Gemini is only the processor.

The worker must securely access the Cloudinary evidence and provide it to Gemini using the **current supported input method**.

For small media, inline input may be appropriate according to current provider limits.

For larger audio/video, use Gemini Files API/current recommended method.

Do not hard-code stale limits from memory. Read current Gemini docs during implementation.

If temporary files are created, clean them up safely.

---

# 10. INCIDENT MATCHING WITHOUT PGVECTOR

Do not build an embedding/vector system initially.

Use PostGIS and structured fields to narrow candidates:

- open/relevant status;
- same/compatible category;
- nearby within category-specific radius;
- relevant time window;
- same asset where known.

Then give only the small candidate set to Gemini.

Gemini returns structured:

- `MATCH` with one supplied candidate ID;
- `NEW`;
- `REVIEW_REQUIRED`.

Gemini must not return an incident ID not supplied.

Be conservative. Two potholes on the same road may be different incidents.

If uncertain, create review rather than merging incorrectly.

---

# 11. GOVERNMENT ORGANIZATION DATA

Government onboarding is not a simple profile form. The data is essential to AI responsibility routing.

For every government organization collect/verify enough fields including:

- official legal name;
- acronym;
- logo;
- government level: FEDERAL / STATE / LGA;
- organization type;
- parent organization;
- supervising organization;
- jurisdiction/service area;
- official mandate;
- responsibilities;
- explicit exclusions;
- issue categories;
- asset types;
- ownership/management responsibilities;
- official source links;
- establishing law/gazette/source documents where available;
- public contacts;
- operational contacts;
- escalation contacts;
- active status;
- verification state.

Every important mandate should be traceable to an official/administrator-verified source.

CivicPulse admin must approve/verify organizations before they become eligible AI routing candidates.

Do not hard-code fake ministries in production seed data.

---

# 12. AI GOVERNMENT RESPONSIBILITY ROUTING

After PostGIS has resolved jurisdiction and CivicPulse understands the issue, build an eligible candidate set from:

- verified LGA organizations in the relevant LGA;
- verified state organizations in the relevant state;
- verified federal organizations with applicable mandate;
- known verified asset owner/manager where available.

Do not send all Nigerian organizations to Gemini.

For each candidate provide curated:

- organization ID;
- official name;
- government level;
- mandate;
- responsibilities;
- exclusions;
- categories;
- asset responsibilities;
- jurisdiction;
- relevant source metadata.

Also provide:

- incident analysis;
- exact resolved jurisdiction hierarchy;
- affected asset types;
- known asset ownership/management if available.

Gemini must return structured output such as:

```json
{
  "primaryOrganizationId": "candidate-id-or-null",
  "primaryConfidence": 0.93,
  "reason": "Concise auditable rationale",
  "supportingOrganizations": [
    {
      "organizationId": "candidate-id",
      "confidence": 0.76,
      "reason": "Concise rationale"
    }
  ],
  "reviewRequired": false,
  "missingInformation": []
}
```

Backend MUST reject any organization ID not in the supplied candidate set.

One incident may have:

- one PRIMARY responsible organization;
- zero or more SUPPORTING responsible organizations.

If the AI is uncertain, candidate scores are too close, asset ownership is important but unknown, or no organization clearly fits, create `ROUTING_REVIEW_REQUIRED` for CivicPulse admin rather than forcing an answer.

Admin override must preserve the AI suggestion and record the human correction/audit event.

---

# 13. ASSET OWNERSHIP

Create an asset registry that can improve routing where real data is available.

Possible asset types include:

- road;
- bridge;
- drainage;
- school;
- water infrastructure;
- public building;
- other public infrastructure.

Store geometry and verified owner/managing organization where known.

Do not block CivicPulse launch on having a perfect national asset registry.

When ownership is unknown:

- route using other evidence;
- reduce confidence where ownership materially matters;
- ask for human review where necessary.

---

# 14. PUBLIC FEED

Build an incident-centric civic feed so citizens open CivicPulse even when they are not reporting something.

Feed sections may include:

- For You;
- Nearby;
- Following;
- Statewide/national views where appropriate.

Use location/area, follows, category relevance, recency, severity and meaningful updates.

Do not profile sensitive demographics for feed personalization.

Use PostgreSQL queries and indexes. Do not add a search cluster or vector DB.

Each incident card should make it easy to understand:

- what happened;
- location;
- status;
- age;
- number of independent citizen reports;
- evidence count;
- responsible government organization(s);
- latest government/NGO activity;
- community signals.

---

# 15. PUBLIC PARTICIPATION

Citizens should be able to:

- upvote/downvote or use the final equivalent civic reaction labels;
- indicate “I’m affected”;
- confirm an issue where applicable;
- add evidence;
- comment;
- reply;
- follow/unfollow;
- report abusive/inaccurate content;
- confirm/dispute resolution.

Do not treat ordinary popularity as objective severity.

Store stronger signals separately:

- number of independent reports;
- nearby affected confirmations;
- independent evidence;
- community resolution verification.

Use database uniqueness constraints to prevent duplicate actions.

---

# 16. PUBLIC INCIDENT TIMELINE

Every incident should become a living public accountability record.

Timeline examples:

```text
Citizen report received
Additional reports attached
Government organization assigned
Government acknowledged
Inspection completed
Government update published
NGO expressed interest
NGO proposal submitted
Government approved in principle
Authorized to commence
Work started
Milestone submitted
Government marked resolved
Community verification opened
Resolution confirmed/disputed
Incident closed
```

Do not silently overwrite meaningful history.

Verified organization actions must display verified government/NGO identity clearly.

Citizen comments must be visually distinguishable from verified official statements.

---

# 17. GOVERNMENT DASHBOARD

Government users need an operational dashboard, not just a profile page.

Implement:

- assigned incident list;
- filtering/search;
- incident detail;
- aggregated citizen reports/evidence;
- AI routing reason/confidence;
- primary/supporting responsibility role;
- acknowledge;
- permitted status transitions;
- public official updates;
- private/internal update if PRD supports it;
- inspection/progress/resolution evidence;
- routing review request;
- NGO proposal review;
- response/approval workflow;
- activity/history;
- basic responsiveness metrics.

Backend controls status transitions.

Do not accept arbitrary client-provided status values.

Government users may only act for organizations where they have active authorized membership.

---

# 18. OFFICIAL RESOLUTION VS COMMUNITY VERIFICATION

Never collapse government status and public verification into one status.

Example:

```text
Official status: RESOLVED
Community verification: DISPUTED
```

Government can submit resolution with evidence.

Citizens can then:

- confirm the problem appears solved;
- dispute it and submit new evidence/comments.

A citizen dispute does not forge an official government status change.

A government resolution does not erase community disagreement.

This transparency is a core CivicPulse feature.

---

# 19. NGO ONBOARDING

Collect all details required in `06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md`.

At minimum:

- legal/registered name;
- logo;
- registration/CAC information where applicable;
- organization type;
- official address;
- website;
- contacts;
- authorized representatives;
- focus areas;
- geographical scope;
- funding capability;
- implementation/execution capability;
- technical expertise;
- infrastructure categories;
- project history;
- supporting documents;
- verification state.

CivicPulse admin verifies NGO before formal intervention privileges according to product rules.

---

# 20. NGO DASHBOARD AND INTERVENTIONS

Verified NGOs can discover public incidents relevant to their interests/capabilities.

Filters may include:

- location;
- category;
- severity;
- age;
- responsible government organization;
- intervention type;
- community impact/signals.

Use **Express Interest** / **Propose Intervention**, not “claim issue.”

Supported participation types:

- FUND;
- CO_FUND;
- EXECUTE;
- FUND_AND_EXECUTE;
- MATERIALS;
- TECHNICAL_ASSISTANCE;
- COMMUNITY_SUPPORT;
- MONITORING;
- ADVOCACY.

Intervention lifecycle:

```text
DISCOVERABLE ISSUE
 ↓
EXPRESS INTEREST
 ↓
DRAFT PROPOSAL
 ↓
PROPOSAL SUBMITTED
 ↓
GOVERNMENT REVIEW
 ├─ REJECTED
 ├─ CHANGES REQUESTED
 └─ APPROVED IN PRINCIPLE
        ↓
REQUIRED APPROVALS / CONDITIONS
        ↓
AUTHORIZED TO COMMENCE
        ↓
IN PROGRESS
        ↓
COMPLETION SUBMITTED
        ↓
GOVERNMENT INSPECTION
        ↓
ACCEPTED / REMEDIATION REQUIRED
        ↓
HANDOVER
        ↓
INCIDENT RESOLUTION FLOW
```

An NGO cannot click a button and unilaterally authorize itself to perform work on a public asset.

CivicPulse records whatever specific approval/authorization the competent authority requires; do not invent a universal Nigerian NGO infrastructure permit.

---

# 21. CIVICPULSE ADMIN DASHBOARD

Build serious internal administration for:

- government organization verification;
- NGO verification;
- mandate/source review;
- organization hierarchy;
- organization jurisdictions;
- boundary data;
- asset registry;
- low-confidence routing review;
- manual routing correction;
- incident merge/split;
- failed report processing/retry;
- content moderation;
- user abuse reports;
- resolution disputes;
- NGO intervention oversight;
- audit logs;
- taxonomy/configuration.

Destructive/high-impact actions should use confirmation dialogs and clear consequences.

All admin actions are server-authorized and audited where meaningful.

---

# 22. AUTHENTICATION

Keep authentication simple and secure.

Initial system:

- email/password;
- Argon2id password hashing using current safe guidance;
- email verification;
- forgot/reset password;
- opaque server-side sessions stored in PostgreSQL;
- random session token in HttpOnly cookie;
- secure production cookie;
- logout revokes session.

Do not build an unnecessary JWT access/refresh token system unless a later documented requirement requires it.

Implement organization membership/roles separately from global user identity.

---

# 23. PERMISSIONS

Frontend may hide irrelevant controls, but backend must independently enforce permissions.

At minimum distinguish:

- citizen;
- government organization member/officer/manager/admin as needed;
- NGO organization member/manager/admin as needed;
- CivicPulse moderator;
- CivicPulse admin.

Verify active organization membership and organization verification before official actions.

Never trust role/organization IDs sent by browser without server checks.

---

# 24. SECURITY AND PRIVACY

Implement the full `08_SECURITY_PRIVACY_MODERATION_AND_AUDIT.md` requirements.

At minimum:

- HTTPS production assumptions;
- Helmet/security headers;
- strict CORS/origin policy;
- safe cookie config;
- parameterized SQL;
- Zod validation;
- request size limits;
- rate limiting/abuse protection;
- XSS-safe text rendering;
- file type/size validation;
- Cloudinary signed uploads;
- restricted media access;
- no secrets in browser bundle;
- server-side permissions;
- audit of privileged actions;
- safe remote-media fetching;
- data minimization;
- exact location privacy;
- moderation/report abuse.

Do not add Redis solely for rate limiting. Use a PostgreSQL/deployment-edge compatible solution appropriate to the final hosting environment.

---

# 25. MODERATION

Public civic conversations can contain spam, harassment, doxxing, accusations and political arguments.

Implement:

- report content;
- moderation status;
- admin/moderator queue;
- hide/remove/restore/restrict actions;
- reasons;
- audit trail;
- verified identity badges.

AI may help flag/prioritize content, but do not let an LLM silently perform irreversible high-impact moderation without product policy/review safeguards.

---

# 26. DATABASE REQUIREMENTS

Use PostgreSQL + PostGIS with versioned SQL migrations.

Do not introduce an ORM by default.

Use `pg` and parameterized SQL.

Important tables/concepts include:

```text
users
sessions
verification_tokens
password_reset_tokens

organizations
organization_members
government_profiles
ngo_profiles
organization_jurisdictions
organization_mandate_sources

jurisdictions
assets

reports
report_media
report_analysis

incidents
incident_reports
incident_merge_history
incident_assignments
routing_decisions
incident_updates
incident_status_history

incident_reactions
affected_confirmations
incident_comments
incident_follows
resolution_verifications

intervention_expressions_of_interest
intervention_proposals
intervention_participants
intervention_approvals
intervention_milestones
intervention_evidence
intervention_completion_submissions
intervention_handover

moderation_reports
moderation_actions
audit_logs
notifications
```

Use UUIDs, UTC timestamps, foreign keys, unique constraints, check constraints where useful and indexes based on real query paths.

Use GIST indexes for PostGIS geometry columns.

---

# 27. API DESIGN

Use REST under `/api/v1`.

Keep endpoints predictable and resource-oriented.

Representative groups:

```text
/auth/*
/media/*
/reports/*
/incidents/*
/organizations/*
/government/*
/ngo/*
/admin/*
/notifications/*
```

Use consistent response/error shape.

Stable error codes should exist for common cases.

Never return raw stack traces/provider secrets.

---

# 28. FRONTEND DESIGN/UX

Read `docs/design.md` and implement it faithfully across the full app.

The supplied style is Botanical / Organic Serif with:

- warm alabaster/rice-paper background;
- deep forest foreground;
- sage primary accents;
- clay/mushroom secondary surfaces;
- terracotta interactive accents;
- Playfair Display headings;
- Source Sans 3 body text;
- rounded cards/pills/organic image shapes;
- subtle paper grain;
- generous whitespace;
- graceful motion;
- accessible focus states;
- responsive mobile-first behavior.

Do not create a generic blue/gray SaaS dashboard.

However, dashboards are operational interfaces. Preserve readability, information hierarchy and efficient task completion. Adapt the design system intelligently rather than making every table huge/decorative.

Centralize design tokens/components.

Build reusable accessible primitives for buttons, form fields, cards, status badges, dialogs, navigation, tables/lists, empty/loading/error states, media viewer and organization/incident badges.

---

# 29. RESPONSIVENESS AND ACCESSIBILITY

The entire product must work on mobile, tablet and desktop.

Citizen reporting/feed is especially mobile-sensitive.

Government/NGO/admin dashboards should remain usable on tablets and gracefully adapt on smaller screens.

Meet core accessibility requirements:

- keyboard navigation;
- semantic labels;
- visible focus;
- appropriate contrast;
- form error association;
- modal/dialog focus management;
- meaningful icon labels;
- sufficient touch targets;
- reduced-motion consideration.

---

# 30. NO MOCKS / NO FAKE PRODUCT BEHAVIOR

This is critical.

Production/runtime code must not contain:

- fake Gemini responses;
- fake Cloudinary upload success;
- fake email success;
- fake government assignment;
- fake incident matching;
- fake location/jurisdiction;
- sample incidents hard-coded into production UI;
- in-memory arrays pretending to be a database;
- `setTimeout` pretending background processing happened;
- buttons that only show “success” without a real operation;
- demo APIs;
- fallback provider that returns canned data when env variables are missing;
- placeholder official organizations presented as real.

If a required integration is missing credentials, implement the real integration and report the real test as **BLOCKED/UNVERIFIED**. Do not make it green with a mock.

Automated unit tests may use test doubles where isolation is the actual test purpose. This does not permit production fake providers.

Test databases may use clearly labeled test fixtures/accounts; never seed those into production.

---

# 31. TESTING STRATEGY

You must write and run tests throughout development, not only at the end.

Required:

## Type/build

- TypeScript strict checks for web/server.
- Vite production build.
- backend production build.

Vite alone is not a typecheck. Run `tsc --noEmit` or equivalent separately.

## Unit tests

Business rules.

## API integration

Express against real dedicated PostgreSQL/PostGIS.

## Worker integration

Graphile Worker against real test PostgreSQL.

## Provider contract tests

With real test credentials when available:

- Cloudinary signed upload/verification;
- Gemini text;
- Gemini image;
- Gemini audio/transcription/language;
- Gemini video where configured/account limits permit;
- SMTP if configured.

## Browser E2E

Playwright through actual frontend + backend + DB + worker.

---

# 32. TEST IMPORTANT EDGE CASES

At minimum test edge cases documented in `07_TESTING_ACCEPTANCE_AND_EDGE_CASES.md`, including:

### Auth

- duplicate account;
- invalid credentials;
- expired/revoked session;
- permission escalation;
- removed organization member.

### Media

- unsupported file;
- too large;
- upload interrupted;
- nonexistent/tampered asset reference;
- private-media access attempt.

### Location

- location permission denied;
- low GPS accuracy;
- point outside loaded boundary;
- border point;
- invalid boundary data.

### AI

- unknown language;
- noisy audio;
- no speech;
- image without civic issue;
- malformed Gemini response;
- Gemini timeout;
- repeated worker attempt.

### Matching

- multiple people report exact same problem;
- nearby but different potholes;
- recurring previously resolved issue;
- ambiguous candidate.

### Routing

- LGA vs state vs federal responsibility;
- multi-agency incident;
- inactive/unverified candidate;
- explicit mandate exclusion;
- no suitable candidate;
- unknown organization ID returned by AI;
- low-confidence result;
- admin correction.

### Feed/social

- duplicate votes;
- duplicate affected confirmations;
- unauthorized comment edit;
- moderation report;
- hidden content no longer visible.

### Government

- invalid status jump;
- unassigned org tries to modify;
- resolution without required evidence where policy requires it.

### NGO

- unverified NGO proposal attempt;
- proposal revision;
- rejected proposal;
- cannot commence without authorization;
- expired/withdrawn intervention;
- completion/remediation/handover.

---

# 33. COMPLETE END-TO-END PRODUCT TEST

Before finalizing, execute a real test-environment journey that crosses every layer:

```text
Admin sets up/verifies test government organization
Admin verifies test NGO
        ↓
Citizen registers and logs in
        ↓
Citizen submits report with actual test Cloudinary media and confirmed location
        ↓
Graphile Worker receives job
        ↓
Gemini actually analyzes configured media
        ↓
language/transcript/structured analysis persisted
        ↓
PostGIS resolves test jurisdiction
        ↓
incident matching creates/attaches incident
        ↓
AI chooses from verified test government candidates
        ↓
government officer logs in and receives incident
        ↓
government acknowledges and publishes update
        ↓
citizen feed/timeline updates
        ↓
NGO discovers issue and expresses interest
        ↓
NGO submits proposal
        ↓
government requests changes or approves through real workflow
        ↓
NGO submits milestone/completion evidence
        ↓
government records resolution
        ↓
citizen confirms or disputes resolution
        ↓
public timeline correctly contains the full history
```

This must run against test/staging data, never pretend that test organizations are official production entities.

---

# 34. MANDATORY “CLICK EVERY BUTTON” / INTERACTION PASS

This requirement is not optional.

When all features are implemented, create a route/action inventory for every role:

- unauthenticated/public;
- citizen;
- government member/officer/manager/admin roles actually implemented;
- NGO member/manager/admin roles actually implemented;
- CivicPulse moderator/admin.

Inventory every reachable active control:

- buttons;
- links;
- mobile navigation;
- menu items;
- tabs;
- accordions;
- dropdowns;
- selects;
- filters;
- search;
- pagination/load-more;
- forms/submits;
- checkboxes/radios;
- file upload controls;
- audio recording controls if implemented;
- map pin/location actions;
- modal/dialog buttons;
- drawers;
- retry/cancel/remove actions;
- votes/reactions;
- “I'm affected”;
- confirm issue;
- comments/replies/edit/delete/report;
- follow/unfollow;
- add evidence;
- government acknowledgement/status/update/evidence/routing-review actions;
- NGO express-interest/proposal/revision/milestone/completion actions;
- government NGO approval/rejection/change-request actions;
- admin organization verification actions;
- boundary/asset management controls;
- routing override;
- incident merge/split;
- moderation hide/remove/restore;
- failed-processing retry;
- logout;
- destructive confirmations.

Use Playwright and/or available browser tooling to actually exercise each reachable active control.

For each important state-changing action, do not merely check that a click handler fires. Verify:

1. the UI gives the correct state/loading/feedback;
2. the correct HTTP request occurs;
3. response is correct;
4. database/business state changed correctly;
5. refreshed/reopened page shows persisted state;
6. unauthorized role cannot perform the action.

While doing the pass, inspect:

- browser console errors;
- failed/unexpected network calls;
- 404 links;
- stuck loading spinners;
- unhandled promise rejections;
- double submissions;
- broken back/refresh/deep-link behavior;
- mobile layout breakage;
- focus/accessibility problems.

If you find a bug, fix it and rerun the affected flow.

An active button that is not wired to a real completed feature is a release blocker.

Do not leave disabled “coming soon” controls unless the PRD explicitly treats that feature as out of scope; if shown, label it clearly and do not make it appear functional.

---

# 35. FAILURE TESTING

Test realistic failures rather than only happy paths:

- Gemini temporary outage/timeout;
- invalid Gemini structured data;
- Cloudinary upload interruption;
- Cloudinary verification fails;
- worker process stops and restarts;
- database unavailable;
- email provider unavailable;
- map/geocoder unavailable;
- unknown jurisdiction;
- low-confidence routing;
- simultaneous duplicate reports;
- rapid duplicate votes/submits;
- session revoked while dashboard is open;
- NGO authorization expires/is revoked before commencement;
- private evidence access denied.

Expected behavior should be controlled, recoverable where possible and truthful. Never display successful completion for failed backend state.

---

# 36. PERFORMANCE AND SCALABILITY WITHOUT OVERENGINEERING

Implement sensible basics:

- spatial indexes;
- indexes for feed/status/assignment/comment queries;
- cursor pagination;
- bounded page sizes;
- database connection pooling;
- background media/AI work;
- direct Cloudinary upload;
- no N+1 query patterns on main dashboards/feed;
- compress/minify production assets;
- lazy-load heavy media/dashboard routes where useful.

Do not add Redis caching before there is a measured need.

Do not add a vector database before matching quality/scale requires it.

Do not split services before there is a concrete independent scaling/team/reliability reason.

The future scale path is:

1. optimize indexes/SQL;
2. tune/scale PostgreSQL;
3. add API instances;
4. add worker instances/concurrency;
5. add cache/search/vector infrastructure only based on measurements.

---

# 37. NOTIFICATIONS

Implement in-app notifications for meaningful events.

Email may be used for:

- verification;
- password reset;
- important report/government/NGO updates according to preferences.

Use a real SMTP integration and Graphile Worker task for retryable email if appropriate.

Do not create a Kafka/event infrastructure for notifications.

Avoid notification spam; group or preference-gate noncritical updates.

---

# 38. TRANSPARENCY METRICS

Government/public organization pages may expose useful auditable metrics derived from real data, such as:

- assigned incidents;
- open/resolved counts;
- acknowledgement rate;
- median acknowledgement time;
- median resolution time;
- overdue incidents if an SLA exists;
- community-confirmed resolution rate.

Do not invent an opaque “good government score” without an explicit transparent formula/product decision.

---

# 39. AUDITABILITY

Audit meaningful privileged actions:

- government/NGO verification;
- mandate changes/approval;
- role/membership privilege changes;
- routing override;
- incident merge/split;
- official status transition;
- resolution;
- NGO proposal decision;
- authorization to commence;
- moderation actions;
- boundary/asset administrative changes;
- relevant failed-job manual retry.

Do not log every page view as an audit event.

---

# 40. IMPLEMENTATION ORDER

Although this is a one-shot request, work internally in this order and keep the application buildable/testable after each phase:

## Phase 0 — Audit/read docs

Understand repository and dependencies.

## Phase 1 — Foundation

Workspace, React/Vite, Express/TS, shared design system, basic routes, health, tooling.

## Phase 2 — Database/auth

Postgres/PostGIS, migrations, users/sessions/auth/permissions.

## Phase 3 — Organizations

Government + NGO onboarding, organization memberships, CivicPulse admin verification.

## Phase 4 — Media/report UX

Cloudinary signed upload, location/map, citizen report drafts/submission.

## Phase 5 — Worker + AI

Graphile Worker and Gemini multimodal processing/language extraction.

## Phase 6 — Geospatial/intelligence

Jurisdiction, incident matching, asset registry, AI government routing/review.

## Phase 7 — Public transparency

Feed, incident page, timeline, comments, reactions, affected/follows/evidence.

## Phase 8 — Government

Operations dashboard, status/update/evidence, routing review, resolution/community verification.

## Phase 9 — NGO

Discovery, interest, proposal, approval, execution/milestones/completion/handover.

## Phase 10 — Platform admin/moderation/notifications/metrics

Complete operational controls.

## Phase 11 — Hardening/release

Security, failure paths, full test suite, browser interaction inventory, deployment documentation.

After each major phase:

- typecheck;
- run relevant tests;
- fix errors before proceeding;
- do not accumulate known broken compilation/flows until the end.

---

# 41. WHEN TO ASK THE USER

The user explicitly allows focused questions when something genuinely cannot be known.

Ask only when implementation would otherwise require making a material arbitrary choice, such as:

- map/geocoding provider if no provider is specified;
- email/SMTP provider if the repo/user has no preferred way and a specific vendor choice is required;
- real production boundary source if multiple legally/licensing-distinct datasets are available and the user must choose;
- a business rule that genuinely has two different product meanings not resolved by the PRD.

Do not ask:

- whether the frontend should be React/Vite;
- whether backend should be Express/TS;
- whether to use Cloudinary;
- whether to use Gemini;
- whether to support government/NGO/admin dashboards;
- whether the design file applies to the whole app;
- whether reports and incidents are separate;
- whether the feed exists;
- whether citizens can comment/vote/follow;
- whether NGOs require government authorization before physical intervention.

Those decisions are already made.

---

# 42. FINAL DOCUMENTATION YOU MUST LEAVE IN THE REPOSITORY

At minimum create/update:

- root `README.md`;
- `.env.example`;
- setup instructions;
- migration/boundary import instructions;
- Cloudinary setup;
- Gemini setup;
- map/geocoder setup;
- government/NGO onboarding notes;
- architecture summary;
- API/run commands;
- testing guide;
- deployment guide;
- known limitations/remaining decisions.

Keep docs aligned with the code. Do not document commands that were never run/verified.

---

# 43. FINAL RESPONSE TO THE USER

When the work is complete, do not merely say “done.”

Provide a senior-engineer handoff containing:

## A. What you built

Summarize every completed module/user flow.

## B. Architecture

Explain the final simplified architecture and any deviation from this prompt with justification.

## C. Repository structure

Explain important folders/files.

## D. Environment variables

List every variable, whether required/optional, where to obtain it and whether browser/server-only.

## E. Local setup

Exact commands from clean clone to running app:

- install;
- start Postgres/PostGIS;
- migrate;
- API;
- worker;
- Vite frontend.

## F. External setup

Exact Cloudinary/Gemini/map/email steps.

## G. Production data setup

How to load jurisdiction boundaries, onboard/verify organizations and manage asset data.

## H. Testing

Report:

- typecheck;
- lint;
- unit;
- integration;
- worker;
- Playwright;
- Cloudinary real test;
- Gemini real tests;
- SMTP/map provider tests where configured.

For each: PASS / FAIL / BLOCKED.

## I. Browser interaction audit

Report routes/roles/actions exercised and defects found/fixed.

## J. Deployment

Explain how to deploy frontend/API/worker/Postgres without introducing unnecessary infrastructure.

## K. Known limitations

List anything not complete or dependent on data/credentials/provider decisions.

## L. Production readiness

State whether any known production blocker remains.

If there is one, do **not** call the application production-ready.

---

# 44. FINAL QUALITY BAR

CivicPulse should feel like one coherent product, not four separate dashboards assembled from templates.

A citizen should be able to report a problem with minimal bureaucracy.

A government officer should immediately understand what CivicPulse believes happened, why the organization was selected and what action is needed.

An NGO should be able to discover real issues and navigate intervention approval without pretending it owns public infrastructure.

A CivicPulse admin should be able to govern verification, routing uncertainty, moderation and data quality.

The public should be able to see a truthful timeline from report to responsibility to action to resolution, including disagreement when citizens believe a problem is not actually fixed.

Keep the codebase simple enough that another experienced TypeScript engineer can understand it without studying a distributed-systems diagram first.

Build the complete product, test the real product, fix what breaks, document what remains, and never use a mock to disguise unfinished production functionality.
