# CivicPulse Security, Privacy, Moderation and Audit Specification

CivicPulse handles citizen location, media evidence, government accounts, public comments and potentially sensitive civic information. Security must be serious, but the implementation should remain straightforward.

---

# 1. Security principles

1. Trust server-side authorization, never UI visibility.
2. Validate every external input.
3. Keep secrets exclusively on the server.
4. Minimize personal data collection.
5. Separate private evidence from public content.
6. Preserve meaningful official action history.
7. Treat AI output as untrusted structured input until validated.
8. Make abuse/reporting/moderation available from the beginning.
9. Do not add complicated security products where normal application controls suffice.

---

# 2. Secrets

Server-only secrets include:

- database credentials;
- session secret;
- Cloudinary API secret;
- Gemini API key;
- SMTP password;
- private map/geocoder keys if applicable.

Never expose them via Vite `VITE_*`, API responses, client logs or repository files.

---

# 3. Authentication

Initial release:

- email/password;
- Argon2id password hashing using current safe configuration;
- email verification;
- server-side opaque sessions stored in PostgreSQL;
- HttpOnly cookie;
- Secure cookie in production;
- SameSite chosen deliberately for frontend/API domain topology;
- logout revokes session;
- password reset revokes or offers to revoke old sessions.

Session tokens should be random and store only a hash in DB where practical.

---

# 4. Authorization

Roles are contextual.

Examples:

- platform roles: CIVICPULSE_ADMIN, MODERATOR;
- organization membership roles: MEMBER, OFFICER, MANAGER, ORG_ADMIN;
- organization kind/verification status further constrains permissions.

Always verify:

- user session;
- organization membership;
- membership status;
- organization verification status;
- role capability;
- incident assignment/intervention relationship where required.

---

# 5. Rate limiting and abuse controls

Protect at least:

- login;
- register;
- password reset;
- report submission;
- upload signature generation;
- comments;
- reactions;
- affected confirmations;
- moderation/report-abuse endpoints.

Because no Redis is in the default stack, use a production-compatible rate limiter backed by PostgreSQL or a deployment-edge/provider limiter if needed at scale. A simple per-process limiter may be used only as additional local protection, not the sole multi-instance guarantee.

Do not introduce Redis solely for rate limiting unless measured abuse/scale justifies it.

---

# 6. Media security

Citizen media can contain:

- faces;
- children;
- homes;
- number plates;
- documents;
- voices;
- exact location clues;
- bystanders.

Therefore:

- signed uploads only;
- enforce allowed types/sizes;
- verify asset after upload;
- do not expose Cloudinary secret;
- default original evidence to restricted/authenticated delivery where feasible;
- backend authorizes delivery URLs;
- public-media visibility is explicit;
- moderation can hide public delivery while preserving evidence for authorized review;
- deleting public content should not silently destroy evidence required for a dispute/audit unless policy requires deletion.

No Cloudinary webhook is required.

---

# 7. Location privacy

Exact report coordinates are useful internally for jurisdiction and duplicate matching but should not always be public.

Public incident pages may display:

- approximate location;
- street/area name;
- a map point with deliberate precision policy.

Do not reveal a citizen's home address simply because device GPS was captured.

“I’m affected” should not publicly reveal a user's live/home coordinates.

---

# 8. Data minimization

Do not collect demographics merely to personalize a feed unless there is a concrete product need and lawful/privacy-safe basis.

Feed relevance should primarily use:

- area/location;
- followed places/categories/incidents;
- proximity;
- incident importance;
- freshness;
- user interactions.

Avoid sensitive personal profiling.

---

# 9. AI safety/data handling

Before sending data to Gemini:

- send only data needed for the task;
- do not include unrelated user profile information;
- avoid unnecessary private identifiers;
- follow the configured provider data/privacy terms for production.

Validate AI output with Zod/application rules.

AI must not be able to select arbitrary government IDs outside the candidate set.

Do not store hidden chain-of-thought. Store concise routing/extraction rationale intended for product/audit use.

---

# 10. Public comments and defamation/privacy risks

Comments are user-generated content, not CivicPulse-verified facts.

UI should visually distinguish:

- citizen comment;
- verified government update;
- verified NGO update;
- CivicPulse system event.

Users must be able to report content for:

- harassment;
- threats;
- hate/abuse;
- spam;
- personal information/doxxing;
- impersonation;
- false/misleading claims;
- graphic content;
- irrelevant content.

Moderators need hide/remove/restrict tools with reasons and audit trail.

---

# 11. Evidence vs public discussion

Evidence should be categorized distinctly from comments.

An evidence submission should have:

- uploader;
- incident/report;
- timestamp;
- media/text;
- visibility;
- moderation state;
- optional location metadata;
- provenance metadata available to authorized users.

Do not treat an upvoted comment as evidence.

---

# 12. Government identity

Only verified organization members may publish as a government organization.

Public UI clearly badges verified organization content.

If a user's membership is revoked, they immediately lose organization actions even if their session remains valid.

High-impact actions such as resolution or approval should record the acting user and organization.

---

# 13. NGO identity

Only verified NGOs may submit formal intervention proposals.

Verification status must be visible internally and, where appropriate, publicly.

NGOs may browse before verification according to product rules, but cannot represent themselves as approved/authorized before actual approval.

---

# 14. Audit log

Audit meaningful privileged actions, including:

- government/NGO verification decision;
- organization mandate edit/approval;
- organization membership privilege changes;
- incident routing override;
- incident merge/split;
- official status transition;
- government resolution;
- NGO proposal approval/rejection;
- authorization to commence;
- moderation removal/restoration;
- boundary/asset administrative changes;
- admin processing retry where relevant.

Audit record:

- actor user;
- actor organization where applicable;
- action type;
- target type/id;
- timestamp;
- concise before/after or metadata where safe;
- request ID.

Audit logs are append-oriented and protected from ordinary user edits.

---

# 15. Official status vs community verification

Government official status and community verification are separate.

Example:

```text
Official status: RESOLVED
Community verification: DISPUTED
```

Community dispute does not forge a government status change. Government resolution does not erase citizen disagreement.

This distinction is central to CivicPulse transparency.

---

# 16. Browser/API security

- strict CORS origin allowlist;
- validate `Origin` on sensitive cookie-authenticated requests as appropriate;
- Helmet/security headers;
- safe CSP compatible with required Cloudinary/map domains;
- no unsafe HTML rendering from comments/AI output;
- file upload MIME/size validation;
- SQL parameterization;
- pagination limits;
- URL allowlists when backend fetches remote media;
- SSRF protection for any server-side URL fetching.

When worker downloads Cloudinary evidence, build URLs from trusted Cloudinary SDK/data rather than accepting arbitrary user-supplied fetch URLs.

---

# 17. Moderation workflow

```text
content created
   ↓
automatic basic validation
   ↓
public/pending according to content type
   ↓
user reports or AI/admin flag
   ↓
moderator review
   ↓
keep / hide / remove / restrict / escalate
   ↓
audit action
```

AI moderation may assist prioritization, but do not silently let an LLM make irreversible high-impact moderation decisions without policy/review safeguards.

---

# 18. Deletion/account requests

Implement product policy for:

- account deletion;
- deletion/anonymization of comments;
- evidence retention where deletion conflicts with public-record/dispute/legal needs;
- organization-member removal;
- session revocation.

Do not promise a legal retention rule in code without a defined policy. Document unresolved retention/legal decisions for the user.

---

# 19. Security acceptance blockers

Do not call the app production-ready if any of these are true:

- Cloudinary secret appears in browser bundle;
- public users can fetch private evidence without authorization;
- client can assign itself organization/admin role;
- route permissions rely only on frontend hiding;
- SQL injection is possible;
- comments render unsanitized HTML;
- government status can be changed by unauthorized user;
- NGO can mark itself authorized without government action;
- Gemini can return arbitrary organization ID and backend trusts it;
- exact citizen location is exposed contrary to configured policy;
- login/report/comment endpoints have no abuse controls;
- audit-critical privileged actions leave no record.
