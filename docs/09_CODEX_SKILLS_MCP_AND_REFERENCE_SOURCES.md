# CivicPulse Codex Skills, MCP and Reference Sources

The goal is **not** to install many MCP servers. CivicPulse should be buildable with ordinary repository access plus current official documentation.

---

# 1. Rule

Use an MCP/skill only if it materially helps Codex access current provider documentation or the actual repository/design workflow.

Do not add an MCP simply because a technology exists.

---

# 2. Useful integrations

## GitHub

If the repository is on GitHub and the connector is available, repository/PR/issue/CI access is useful for real engineering work.

## Figma

Only needed if the user later provides a Figma design or explicitly wants Figma-based design workflows. `docs/design.md` is currently the canonical design specification.

## Cloudinary official agent resources

Cloudinary publishes current Node.js documentation and agent tooling. If installing Cloudinary's official agent skills/MCP makes current upload/security API usage easier in the user's Codex environment, it is reasonable.

It is optional, not required.

---

# 3. Do NOT add Prisma skills by default

The simplified CivicPulse backend uses `pg` + parameterized SQL and PostGIS directly. There is no Prisma dependency in the canonical architecture, so Prisma MCP/skills are unnecessary.

---

# 4. Current official references Codex should consult

Before implementing provider/library-specific behavior, read current official docs rather than relying on model memory.

## React/Vite

- Vite official guide and React TypeScript template documentation.
- Remember: Vite transpiles TypeScript but does not perform full type checking; run `tsc --noEmit` in CI/build verification.

## Express

- Express 5 official guide/API.
- Use supported Express 5 patterns rather than outdated Express 4 middleware assumptions.

## PostgreSQL/PostGIS

- PostgreSQL official docs.
- PostGIS official docs for geometry/geography, `ST_Contains`, `ST_DWithin`, spatial indexes, GeoJSON import/query behavior.

## Graphile Worker

- Graphile Worker official documentation.
- Use it for background processing because it stores jobs in PostgreSQL and provides retries without requiring Redis.

## Cloudinary

- Cloudinary Node.js SDK docs.
- client-side signed upload docs.
- authenticated/private asset delivery docs.
- asset/resource lookup verification docs.

Canonical CivicPulse flow uses signed direct browser upload + backend asset verification. No Cloudinary webhook is required.

## Gemini

- Google AI for Developers Gemini API docs.
- official `@google/genai` JavaScript/TypeScript SDK.
- structured output docs.
- audio understanding docs.
- video understanding docs.
- file input/File API limits.

Do not hard-code model IDs or media limits from this document if current docs differ.

## Security

- OWASP Application Security Verification Standard/checklists as a practical review reference.
- current Node/Express security guidance.

---

# 5. Map/geocoding provider

No single provider is mandated in this bundle because the user has not chosen one.

When implementation reaches map/geocoding integration:

- if repository/env/docs already identify the provider, use it;
- otherwise ask the user a focused question before choosing a paid/external provider.

Whatever provider is chosen, PostGIS boundary data remains the authority for government jurisdiction.

---

# 6. Nigerian government data/references

Government organization mandates and infrastructure ownership are product data, not facts Codex should hallucinate.

Use:

- official ministry/agency/LGA/state/federal websites;
- establishing laws/gazettes where available;
- official government documents;
- administrator-verified onboarding information.

Store sources in CivicPulse so the routing AI reasons over verified registered organization data.

Boundary and asset datasets must have provenance/licensing information.

---

# 7. Documentation rule

When current official documentation conflicts with an example in this handoff on a provider SDK syntax/version/limit, preserve the **product requirement** but implement it using the current supported API.

Example:

- product requirement: signed direct Cloudinary upload;
- current SDK method/parameters: follow current Cloudinary docs.

Do not silently change product behavior because a library API evolved.

---

# 8. Complexity guard

Codex must not add:

- Redis/BullMQ;
- Kafka/RabbitMQ;
- a vector database;
- an ORM;
- microservices;
- Cloudinary webhooks;
- a search cluster;
- Kubernetes;

unless it first identifies a concrete blocker in the specified simpler architecture and explains it to the user.
