# CivicPulse Project Structure and Engineering Standards

This document defines how Codex should structure CivicPulse. The goal is a clean, boring, maintainable TypeScript codebase—not an architecture showcase.

---

# 1. Repository structure

Use npm workspaces unless the existing repository already has a healthy workspace setup that should be preserved.

```text
civicpulse/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── routes/
│   │   │   ├── styles/
│   │   │   ├── main.tsx
│   │   │   └── router.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── server/
│       ├── src/
│       │   ├── config/
│       │   ├── db/
│       │   ├── http/
│       │   ├── middleware/
│       │   ├── modules/
│       │   ├── providers/
│       │   ├── jobs/
│       │   ├── utils/
│       │   ├── http.ts
│       │   └── worker.ts
│       ├── migrations/
│       ├── scripts/
│       └── package.json
│
├── packages/
│   └── shared/
│       └── src/
│
├── docs/
│   └── design.md
├── package.json
├── .env.example
└── README.md
```

Do not create many packages. `shared` should contain only data that is genuinely safe/useful on both browser and server, such as enums, DTO shapes or public constants. Never place server secrets/provider clients in it.

---

# 2. Frontend feature structure

Prefer feature grouping:

```text
features/
├── auth/
├── reports/
├── incidents/
├── feed/
├── comments/
├── government/
├── organizations/
├── ngo/
├── admin/
├── notifications/
└── profile/
```

A feature may contain:

```text
api.ts
components/
hooks.ts
schemas.ts
types.ts
utils.ts
```

Do not create files simply to satisfy a pattern. Small features may need only two files.

---

# 3. Backend module structure

Use domain modules, not framework-heavy layering.

```text
modules/reports/
├── reports.routes.ts
├── reports.service.ts
├── reports.queries.ts
├── reports.schemas.ts
└── reports.types.ts
```

Large/complex modules may additionally have helpers or submodules.

Suggested modules:

```text
auth
users
media
reports
incidents
jurisdictions
organizations
routing
government
feed
comments
ngo
interventions
admin
moderation
notifications
audit
```

Route file responsibilities:

- route path/method;
- authentication/permission middleware;
- input validation;
- call service;
- map service result/error to HTTP response.

Service responsibilities:

- business rules;
- transactions;
- orchestration;
- permission-aware domain operations.

Query/data files:

- SQL and row mapping for complex data access.

Do not create controllers/repositories/use-cases/interfaces/factories for every action unless they solve an actual complexity problem.

---

# 4. Database conventions

- PostgreSQL + PostGIS.
- `pg` Pool is created once per process.
- parameterized SQL only.
- versioned SQL migrations in `apps/server/migrations`.
- migrations must be deterministic and reviewed; do not use schema push in production.
- use UUID primary keys unless a specific table benefits from another key.
- timestamps use UTC in database.
- use database unique constraints for critical invariants.
- use GIST indexes for spatial columns.
- add B-tree indexes based on real query paths.

Keep migrations simple:

```text
001_extensions.sql
002_auth.sql
003_organizations.sql
004_geography.sql
005_reports_incidents.sql
006_feed.sql
007_interventions.sql
008_audit.sql
...
```

A migration runner must maintain a `schema_migrations` table and run each migration exactly once. Alternatively use a mature lightweight SQL migration library if the repo already uses one; do not add an ORM just for migrations.

---

# 5. API conventions

Base path:

`/api/v1`

Responses should be consistent.

Successful single resource example:

```json
{
  "data": {}
}
```

Collection:

```json
{
  "data": [],
  "page": { "nextCursor": null }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "details": {}
  }
}
```

Never expose internal stack traces or raw provider error objects.

---

# 6. Authentication structure

Keep it simple:

- email/password for initial release;
- password hash with current Argon2id guidance;
- server-side opaque sessions stored in PostgreSQL;
- session token stored in HttpOnly secure cookie;
- email verification;
- forgot/reset password;
- logout revokes session;
- role/membership permissions resolved on server.

Avoid a custom access-token/refresh-token JWT architecture unless a future native/public-API requirement specifically needs it.

---

# 7. Authorization

Authorization is not a frontend concern.

Frontend hides/disables irrelevant actions for UX, but Express checks every protected operation.

Examples:

- citizen cannot approve an NGO proposal;
- government officer cannot act for another organization;
- NGO member cannot edit government status;
- organization admin cannot grant CivicPulse super-admin;
- CivicPulse moderator may moderate but should not automatically have every platform administrative power if roles are separated.

Use clear helper functions/middleware such as:

```text
requireAuth
requirePlatformRole
requireOrganizationMembership
requireOrganizationRole
requireIncidentAssignment
```

Avoid a giant generic policy engine for the first release.

---

# 8. Frontend UX standards

`docs/design.md` is mandatory.

The entire CivicPulse product is the design scope. Do not ask whether only one page should use the design system.

Preserve:

- Botanical / Organic Serif identity;
- palette and typography;
- tactile paper texture;
- generous whitespace;
- organic rounded geometry;
- deliberate animation;
- responsiveness;
- accessible focus states;
- mobile touch targets.

But dashboards must remain operationally dense enough to be useful. Do not sacrifice usability for decorative whitespace.

Create shared primitives:

```text
Button
Input
Textarea
Select
Checkbox
Radio
Dialog
Drawer
Toast
Badge
Avatar
Card
Tabs
DataTable where needed
EmptyState
LoadingState
ErrorState
ConfirmDialog
MediaViewer
IncidentStatusBadge
OrganizationBadge
```

Do not style every page independently.

---

# 9. Server state

Use TanStack Query for API data.

Do not manually duplicate server data into a global store.

Use local React state for local UI behavior. Use context only for truly global UI/auth concerns.

---

# 10. Forms

For significant forms:

- Zod schema;
- React Hook Form where useful;
- meaningful field-level validation;
- server error mapping;
- loading state;
- prevent duplicate submit;
- preserve user input after recoverable errors;
- accessible labels/descriptions;
- mobile-friendly controls.

Government/NGO onboarding should be multi-step with save-and-resume where the amount of data warrants it.

---

# 11. Media code

Cloudinary provider belongs in:

```text
server/src/providers/cloudinary.ts
```

Responsibilities:

- configure SDK;
- generate signed upload parameters;
- verify uploaded asset;
- generate authorized delivery URL where required;
- delete asset when policy requires.

Do not scatter Cloudinary SDK calls across routes.

Frontend upload code belongs near `features/media` or report feature.

No Cloudinary webhook route.

---

# 12. Gemini code

Provider wrapper:

```text
server/src/providers/gemini.ts
```

Domain prompts/schemas should live with the domain task, e.g.:

```text
modules/reports/report-analysis.ai.ts
modules/routing/responsibility-routing.ai.ts
modules/incidents/incident-matching.ai.ts
```

This prevents one giant “AI service.”

Every AI call must:

- use structured output where appropriate;
- validate output;
- use explicit candidate IDs when selecting entities;
- record model/version and operational metadata;
- fail safely;
- avoid requesting/storing hidden chain-of-thought.

---

# 13. Background jobs

Graphile Worker tasks:

```text
jobs/tasks/processReport.ts
jobs/tasks/sendEmail.ts
```

Keep payloads small; generally pass IDs, then load source data from PostgreSQL.

`processReport` must be idempotent.

Do not create a custom event bus.

---

# 14. Logging

Use structured logs.

Every request should have a request ID.

Useful fields:

- timestamp
- level
- message
- requestId
- userId only when appropriate
- route
- statusCode
- durationMs
- reportId/incidentId/jobId where applicable

Redact secrets and sensitive personal information.

---

# 15. Code quality

- TypeScript `strict: true`.
- no `any` unless isolated and explained.
- no unchecked type casts to silence the compiler.
- no TODO placeholders in release paths.
- no commented-out dead implementation.
- no duplicate utility libraries for the same job.
- functions should be small enough to understand but do not fragment code into useless wrappers.
- prefer clear names over clever abstractions.
- comments explain _why_, not obvious syntax.

---

# 16. No production mocks

Production code may not contain:

- fake Gemini results;
- fake upload success;
- fake emails;
- hard-coded “assigned agency” responses;
- fake location/jurisdiction;
- `setTimeout` pretending to process jobs;
- in-memory arrays pretending to be persistence;
- buttons wired to toasts without a real operation;
- demo-only alternate service implementation selected when env vars are missing.

When a required provider credential is missing, fail configuration/startup or explicitly disable the feature with a clear development message. Never pretend success.

Test doubles are allowed **inside automated tests** where unit isolation is the purpose. Provider contract/E2E tests must use real provider credentials when they claim the integration works.

---

# 17. Testing layout

Recommended:

```text
apps/server/src/**/*.test.ts
apps/server/test/integration/
apps/web/src/**/*.test.tsx
apps/web/e2e/
```

Playwright E2E should use a dedicated test database and dedicated provider assets/accounts where possible.

Test data must be clearly test-only and never seed fake records into production.

---

# 18. Dependency rule

Before adding a package, ask whether the platform already has a simple solution.

Examples:

- do not add Redis when PostgreSQL-backed jobs suffice;
- do not add an ORM if `pg` + clear SQL is working;
- do not add a state manager because two components share state;
- do not add a search engine before PostgreSQL search is measured as inadequate;
- do not add an event bus for ordinary function calls.

Prefer fewer, well-understood dependencies.
