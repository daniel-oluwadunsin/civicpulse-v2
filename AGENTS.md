# CivicPulse Agent Guide

This file is the implementation contract for work in this repository. Read it before making product, UI, API, database, provider, or deployment changes.

## Product identity

CivicPulse is an incident-centric Nigerian civic-infrastructure reporting and accountability platform. It connects:

1. citizen evidence and lived experience;
2. government responsibility and operational response;
3. verified NGO capacity and intervention; and
4. public transparency and community verification.

The product is not only a complaint form. The core loop is **report → understand → locate → route → act → verify**.

## Required reading

### Always read before implementation

- [`docs/01_PRD.md`](docs/01_PRD.md) — canonical product requirements, roles, workflows, safety rails, and non-goals.
- [`docs/design.md`](docs/design.md) — mandatory visual system and UX direction.
- [`docs/02_TECHNICAL_SPECIFICATIONS.md`](docs/02_TECHNICAL_SPECIFICATIONS.md) — architecture, data model, provider boundaries, API shape, and scaling rules.
- [`docs/03_PROJECT_STRUCTURE_AND_STANDARDS.md`](docs/03_PROJECT_STRUCTURE_AND_STANDARDS.md) — repository layout, module conventions, coding standards, and frontend/server patterns.
- [`docs/08_SECURITY_PRIVACY_MODERATION_AND_AUDIT.md`](docs/08_SECURITY_PRIVACY_MODERATION_AND_AUDIT.md) — auth, authorization, privacy, media security, moderation, and audit requirements.
- [`README.md`](README.md) and [`package.json`](package.json) — current local commands, runtime assumptions, and workspace scripts.

### Read when the change touches the relevant area

- [`docs/05_ENV_SETUP_DEPLOYMENT_AND_OPERATIONS.md`](docs/05_ENV_SETUP_DEPLOYMENT_AND_OPERATIONS.md) — environment variables, providers, migrations, worker operation, production, and incident handling.
- [`docs/06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md`](docs/06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md) — organization fields, verification, mandate data, intervention proposals, approvals, milestones, and handover.
- [`docs/07_TESTING_ACCEPTANCE_AND_EDGE_CASES.md`](docs/07_TESTING_ACCEPTANCE_AND_EDGE_CASES.md) — test layers, release blockers, browser journeys, and the mandatory active-control pass.
- [`docs/09_CODEX_SKILLS_MCP_AND_REFERENCE_SOURCES.md`](docs/09_CODEX_SKILLS_MCP_AND_REFERENCE_SOURCES.md) — allowed tools, source quality, and provider-reference rules.
- [`docs/04_CODEX_BUILD_PROMPTS.md`](docs/04_CODEX_BUILD_PROMPTS.md) — staged build prompts and implementation sequencing.
- [`docs/10_ONE_SHOT_CODEX_PROMPT.md`](docs/10_ONE_SHOT_CODEX_PROMPT.md) — only when following or revising the one-shot build plan.
- [`docs/brand.md`](docs/brand.md) — CivicPulse visual identity, asset inventory, and image-generation provenance.

If a task affects more than one domain, read every matching document before coding. Do not rely on a summary when the source document is available.

## Source-of-truth and conflicts

Use this precedence when guidance overlaps:

1. explicit user request;
2. the PRD for product behavior;
3. `docs/design.md` for visual and interaction decisions;
4. the technical specification for architecture and provider boundaries;
5. project structure, operations, security, onboarding, and testing documents for their respective domains.

`docs/design.md` is the current visual source of truth. The older “Botanical / Organic Serif identity” sentence in the frontend section of `docs/03_PROJECT_STRUCTURE_AND_STANDARDS.md` conflicts with the Swiss International Style defined in `docs/design.md` and the PRD’s requirement to follow that design file. Use Inter, the Swiss grid, rectangular geometry, and the black/white/Swiss-red system unless the design document is intentionally updated first.

## Architecture rules

- Frontend: React + Vite + TypeScript, React Router, TanStack Query, Tailwind CSS, Lucide React, React Hook Form/Zod where useful, and Playwright.
- Backend: Express 5 + TypeScript, Zod, `pg`, SQL migrations, Graphile Worker, Cloudinary, and the official `@google/genai` SDK.
- Database: PostgreSQL + PostGIS is the source of truth. Use spatial indexes and deterministic boundary queries.
- Runtime topology: one web app and one backend codebase with HTTP and worker entry points. This is not a microservice system.
- Shared code belongs in `packages/shared` only when it is safe and useful to both browser and server. Never put secrets or provider clients there.
- Do not add Redis/BullMQ, an ORM, pgvector, Next.js, NestJS, a custom event bus, a transactional-outbox framework, or a new deployable service without first proving a concrete requirement and documenting the trade-off.

Expected structure:

```text
apps/web/src/{app,components,features,hooks,lib,routes,styles}
apps/server/src/{config,db,http,middleware,modules,providers,jobs,utils}
apps/server/migrations
packages/shared/src
```

Keep route handlers thin. Put business rules and transactions in domain services, SQL in query/data modules, and provider calls behind provider wrappers.

## Product invariants

### Report, incident, and evidence

- A **report** is one citizen submission; an **incident** is the real-world problem tracked publicly and operationally.
- Duplicate reports are useful evidence. Do not treat all duplicates as spam or render them as separate primary feed posts.
- Incident merge, split, and report reassignment must preserve history and be auditable.
- Evidence is distinct from public comments and votes.

### Location and routing

- User-confirmed device GPS or map pins are authoritative for geospatial routing. AI may extract place names as hints but must never invent authoritative coordinates or jurisdiction.
- Resolve LGA/state/federal jurisdiction with PostGIS and versioned boundary data. If the boundary result is unresolved, mark review required; do not guess.
- Responsibility AI may select only verified candidate organization IDs supplied by CivicPulse. Reject unknown IDs.
- Store concise, externally useful rationale and source metadata; never request or persist hidden chain-of-thought.
- Low-confidence, conflicting, missing-asset-ownership, or close-confidence routing must surface as human review.

### Status, approvals, and transparency

- Government official status and community verification are separate state machines. A `RESOLVED` incident may still be `COMMUNITY_DISPUTED`.
- AI never changes official status, permissions, approvals, or legal authorization.
- NGO physical intervention cannot commence until the competent authority’s required approval records are satisfied.
- Meaningful official actions, overrides, moderation decisions, status changes, approvals, and resolution submissions require append-oriented audit records.

### Trust and privacy

- Server-side authorization is mandatory even when the frontend hides an action.
- Reporter identity is private by default. Public views must be location-safe and must not expose raw GPS trails or EXIF coordinates.
- Originals are restricted evidence by default; public media visibility is explicit and moderation-aware.
- Comments and AI output are untrusted text. Render safely; never inject unsanitized HTML.
- Do not rank or profile citizens using sensitive attributes such as ethnicity, religion, political affiliation, or health data.
- Never expose secrets, signed private media URLs, stack traces, or unnecessary personal data in the browser, API, logs, or shared package.

## Visual implementation rules

Follow `docs/design.md` and [`docs/brand.md`](docs/brand.md):

- Use Inter and a clear typographic scale; headings and labels are generally uppercase.
- Core palette: `#FFFFFF`, `#000000`, `#F2F2F2`, `#FF3000`. Swiss red is a functional signal, not a decorative fill.
- Use visible grids, dots, diagonals, and restrained noise for depth.
- Prefer asymmetrical grid layouts and flush-left text. Let typography carry hierarchy.
- Use rectangular geometry, `0px` radius, visible borders, and no drop shadows.
- Use Lucide icons as functional symbols. Respect the brand mark’s geometry; do not redraw it ad hoc in page components.
- Reuse shared primitives and feature components. Do not style each page as an isolated one-off.
- Interactive states should be immediate and legible: color inversion, red focus, scale/rotation where meaningful, and short mechanical transitions.
- Provide visible red focus states, semantic HTML, accessible labels, minimum 44px touch targets, and reduced-motion behavior.
- Use the generated assets under `apps/web/public/brand` by their public URL; do not copy them into feature folders or embed large base64 images in components.
- Avoid stock-photo clichés, political symbolism, invented logos, decorative gradients, glassmorphism, neumorphism, rounded-card UI, and ungrounded “futuristic AI” visuals.

## Media and AI boundaries

- Cloudinary is the permanent media store. Use signed browser uploads, verify returned assets server-side, and authorize delivery URLs server-side. There is no Cloudinary webhook.
- Keep Cloudinary calls in `server/src/providers/cloudinary.ts` and domain upload orchestration in the owning feature/module.
- Keep Gemini calls in `server/src/providers/gemini.ts`; keep prompts and schemas near their domain task (`report-analysis.ai.ts`, `incident-matching.ai.ts`, `responsibility-routing.ai.ts`).
- Validate all Gemini output with Zod and semantic application rules. Preserve original-language transcripts and normalized English interpretations.
- Use Graphile Worker for retryable background processing. `process-report` must be idempotent and should pass IDs, not large payloads.
- Missing provider credentials are a clear unavailable/blocked state, never a fake success or hard-coded result.

## Implementation workflow

Before editing:

1. Read the required source documents for the task.
2. Inspect the existing tree and current files with `rg --files` and targeted reads.
3. Preserve unrelated user changes and identify the smallest coherent change.
4. For UI work, identify existing tokens/primitives and keep new components composable.
5. For data/API work, define validation, permission, failure, audit, and idempotency behavior before implementation.

While editing:

- Use parameterized SQL and deterministic migrations.
- Keep user-facing copy plain, specific, and transparent about processing, uncertainty, official status, and community status.
- Avoid buttons that only show a toast unless the underlying operation is real.
- Keep loading, empty, error, retry, and permission-denied states explicit.
- Keep public and private evidence paths distinct.

Before handoff:

1. Run `npm run typecheck`, `npm run build`, and `npm run test` when the relevant workspaces exist.
2. If a required provider, licensed boundary dataset, or test account is unavailable, report it as `BLOCKED` or `UNVERIFIED`; do not claim the integration passed.
3. For UI changes, use the browser/E2E path and exercise every reachable active control from the testing spec.
4. Check responsive layouts at mobile, tablet, and desktop sizes; check keyboard focus and reduced motion.
5. Review the diff for accidental secrets, unsafe logs, arbitrary IDs, untracked generated files, and inconsistent brand usage.
6. Update the relevant docs when behavior, configuration, data shape, or design tokens change.

## Current repository note

The workspace now contains the React/Vite web app, Express/Graphile Worker server, PostgreSQL/PostGIS migrations, and the shared package. Inspect the current tree before creating files; preserve existing domain modules and use the topology above for additions.
