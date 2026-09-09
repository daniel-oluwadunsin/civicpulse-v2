# CivicPulse Product Requirements Document (PRD)

**Document version:** 1.0  
**Product stage:** Production-oriented initial release  
**Geographic starting context:** Nigeria, architected to support national expansion  
**Primary platform:** Responsive web application; architecture should allow future native mobile clients  
**Status:** Canonical product specification

---

# 1. Executive summary

CivicPulse is an AI-powered civic infrastructure reporting, government accountability, and civil-society coordination platform.

A Nigerian citizen should not need to understand which ministry, agency, department, LGA office, state authority, or federal body owns a public problem before reporting it. The citizen should simply describe or show what is wrong. CivicPulse captures the evidence and location, understands the submission across supported Nigerian languages, groups duplicate submissions into one real-world incident, deterministically identifies the relevant geographic jurisdictions, and then uses AI to reason over the verified mandates of government organizations registered in the platform to determine which organizations should respond.

The resulting incident becomes a living public accountability record. Citizens can follow it, discuss it, upvote/downvote feed items, confirm that they are affected, add new evidence, observe government updates, and verify or dispute a claimed resolution. Government organizations receive operational dashboards for assigned incidents, coordination, official updates, status transitions, evidence, and NGO proposals. Verified NGOs receive discovery and intervention dashboards through which they can find civic problems aligned with their mandate, propose funding or execution, obtain government approvals, document progress, and hand work back to the competent authority.

CivicPulse therefore connects four layers that are commonly fragmented:

1. **Citizen evidence and lived experience.**
2. **Government responsibility and operational response.**
3. **Civil-society/NGO capacity and intervention.**
4. **Public transparency and accountability.**

---

# 2. Product thesis

The core problem is not merely that citizens lack a complaint form. Nigeria already has many complaint channels, government social-media accounts, hotlines, physical offices, and informal reporting paths.

The deeper problems are:

- citizens often do not know the responsible government body;
- multiple levels of government have overlapping or confusing mandates;
- public assets may belong to federal, state, or local authorities irrespective of where they are physically located;
- complaints are fragmented across channels and duplicated;
- free-form citizen evidence is hard for institutions to triage consistently;
- Nigerian language and literacy differences create friction;
- citizens frequently cannot see what happened after submitting a complaint;
- government updates may not be centrally visible or attributable;
- NGOs and donors lack a structured, verified pipeline of real community problems that can be legally coordinated with government;
- “resolved” is often a one-sided administrative status rather than a community-verifiable outcome.

CivicPulse solves this by acting as a **civic operating and accountability layer** rather than only a reporting form.

---

# 3. Goals

## 3.1 Primary goals

CivicPulse must:

1. Make civic issue reporting extremely easy.
2. Accept text, images, voice notes/audio, and video.
3. Automatically understand supported Nigerian languages and normalize the report into structured English while preserving the original evidence/transcript.
4. Capture trustworthy location information without asking the AI to invent coordinates.
5. Group multiple reports of the same real-world problem into one incident.
6. Determine LGA/state/federal jurisdiction deterministically from geospatial boundaries.
7. Determine responsible government organizations using AI reasoning over a verified, constrained organization candidate set.
8. Allow multiple organizations to share responsibility where appropriate.
9. Give government organizations a serious operational dashboard.
10. Give citizens a transparent public feed and public incident timeline.
11. Give NGOs a discovery and intervention workflow that respects government authority and project-specific approvals.
12. Preserve immutable audit history for meaningful official actions.
13. Scale beyond a pilot without requiring a ground-up rewrite.
14. Protect citizen privacy while preserving useful public evidence.
15. Provide excellent UX for citizens, government users, NGO users, and CivicPulse administrators.

## 3.2 Secondary goals

- Build a reliable civic dataset for public infrastructure intelligence.
- Enable accountability metrics based on auditable events rather than opaque scoring.
- Support public-sector response SLAs where organizations choose/configure them.
- Allow future CSR/donor/private-sector participation without redesigning the core incident/intervention model.
- Enable future native mobile apps and public APIs.

## 3.3 Non-goals for the first production release

- CivicPulse is not a law-enforcement dispatch system.
- CivicPulse does not unilaterally authorize NGOs to modify public assets.
- CivicPulse does not make binding legal determinations about statutory responsibility.
- CivicPulse does not replace government procurement systems.
- CivicPulse does not make AI-generated coordinates authoritative.
- CivicPulse does not let engagement popularity determine emergency severity.
- CivicPulse does not promise that every Nigerian government organization is onboarded on day one.
- CivicPulse does not create a cryptocurrency/token economy.

---

# 4. Primary user types

## 4.1 Citizen

A resident who wants to report, discover, discuss, follow, validate, or challenge civic infrastructure issues.

Core needs:

- submit quickly;
- communicate naturally;
- avoid bureaucratic classification;
- preserve privacy;
- know that the right institution received the issue;
- follow progress;
- contribute evidence/comments;
- verify outcome.

## 4.2 Government organization user

A verified officer or manager belonging to an onboarded federal, state, or LGA organization.

Core needs:

- receive incidents relevant to its mandate;
- understand why CivicPulse assigned it;
- accept/request routing review/reassign where policy permits;
- coordinate across co-responsible organizations;
- update citizens publicly without repeating communication manually;
- attach evidence/documents;
- manage workflow/status;
- review NGO proposals;
- maintain organization mandate/service data;
- measure workload and responsiveness.

## 4.3 NGO user

A member of a verified NGO/civil-society organization.

Core needs:

- discover verified civic needs;
- filter by location, cause, severity, age, category, estimated intervention type, and community support;
- express interest;
- propose funding/execution/materials/technical/community/monitoring support;
- understand which government authority must approve work;
- submit intervention plans and documents;
- track approvals;
- document milestones, completion, and handover;
- demonstrate impact publicly.

## 4.4 CivicPulse platform administrator/moderator

Internal platform operators.

Core needs:

- verify organizations;
- manage government/NGO onboarding;
- maintain boundaries/taxonomies;
- review ambiguous routing;
- moderate public content;
- merge/split incidents;
- review disputes/abuse;
- manage intervention escalations;
- inspect audit logs and system health;
- manage feature/configuration policies.

---

# 5. Core product concepts

## 5.1 Report

A **Report** is a single citizen submission. It contains the citizen-provided text/media/location and the machine-generated analysis of that submission.

A report is evidence; it is not necessarily a unique real-world problem.

Example:

- Citizen A uploads a pothole photo.
- Citizen B submits a voice note about the same pothole.
- Citizen C uploads a video of the same location.

These are three reports.

## 5.2 Incident

An **Incident** represents the real-world civic problem CivicPulse is tracking.

The three reports above may all attach to one incident: `Large pothole beside Kuto Market`.

The public feed and government workflow are primarily incident-centric to avoid duplicate noise.

## 5.3 Organization

A verified institution registered in CivicPulse. Organization types include:

- federal ministry;
- federal agency;
- state ministry;
- state agency/authority;
- LGA department/unit;
- NGO/civil-society organization;
- future: donor/development partner/private CSR organization.

## 5.4 Government responsibility assignment

A relationship between an incident and a government organization with a role such as:

- `PRIMARY`;
- `CO_RESPONSIBLE`;
- `SUPPORTING`;
- `CONSULTED`.

The assignment stores the AI rationale, confidence, source candidate data, review status, and any human override reason.

## 5.5 Intervention

A structured attempt by an NGO or future partner to fund, execute, support, monitor, or otherwise contribute toward resolving an incident.

## 5.6 Public timeline

An append-oriented sequence of meaningful events on an incident: report growth, assignments, government acknowledgements, inspections, delays, NGO interest, approvals, work commencement, resolution submission, community verification, disputes, and closure.

---

# 6. Citizen reporting experience

## 6.1 UX principle

The citizen should never need to know the category, department, government level, legal mandate, or asset owner before reporting.

Ideal flow:

1. Tap **Report a problem**.
2. Describe it by text and/or media.
3. Allow/confirm location on a map.
4. Review a simple preview.
5. Submit.
6. Immediately receive a receipt while processing continues asynchronously.
7. Later receive the structured incident/routing result and updates.

## 6.2 Supported inputs

A report may contain any combination of:

- typed text;
- one or more images;
- audio/voice note;
- video;
- device GPS coordinates;
- adjusted/confirmed map pin;
- typed landmark/address;
- optional follow-up answers requested after AI analysis.

## 6.3 Supported languages

Initial supported language set:

- English;
- Yoruba;
- Hausa;
- Igbo;
- Nigerian Pidgin.

The citizen should not be forced to choose the language before recording.

For audio/video, CivicPulse should:

1. detect the spoken language, including per-segment differences where possible;
2. preserve the original transcript;
3. produce an English translation/normalized interpretation when needed;
4. retain confidence and uncertainty;
5. combine speech with visual evidence for video.

If language confidence is low, the report remains valid but is flagged for review/follow-up rather than silently inventing meaning.

## 6.4 Report analysis output

The AI should produce schema-constrained analysis including at least:

- whether a civic issue is present;
- detected language(s);
- original transcript;
- translated/normalized English transcript;
- concise title suggestion;
- summary;
- full structured description;
- issue category and subcategory candidates;
- all distinct issue components in a multi-problem report;
- observed evidence statements separated from inferred statements;
- affected asset types;
- hazard/severity factors;
- location mentions in speech/text;
- temporal statements (`since yesterday`, `for two months`) normalized cautiously;
- whether immediate public-safety review may be warranted;
- confidence per major field;
- missing/ambiguous information;
- evidence quality notes.

The AI must distinguish `observed` from `inferred` evidence. Example: “standing water visible” can be observed; “this pipe belongs to the state” cannot be inferred from an image without source data.

---

# 7. Location and jurisdiction

## 7.1 Location sources

Priority order:

1. user-confirmed device GPS/map pin;
2. user-selected map location;
3. geocoded typed address/landmark;
4. media EXIF coordinates as supporting evidence;
5. AI-extracted place names as supporting hints only.

Never let AI-generated coordinates become authoritative.

## 7.2 Stored normalized location

Store at least:

- latitude/longitude;
- precision/accuracy where available;
- location source;
- human-readable address/landmark;
- ward if dataset available;
- LGA;
- state;
- country;
- relevant public asset match if known.

## 7.3 Government boundaries

CivicPulse maintains versioned government boundary datasets in PostGIS. A coordinate is deterministically mapped to eligible geographic jurisdictions.

Use boundary-aware logic that handles points exactly on polygon boundaries safely. The technical specification prefers `ST_Covers` for point-in-jurisdiction checks.

---

# 8. Duplicate report and incident matching

A successful civic platform will receive many duplicate submissions. Duplicates are evidence, not spam, when they independently confirm the same issue.

## 8.1 Candidate generation

When a processed report arrives:

1. query existing incidents within a category-dependent radius using PostGIS;
2. filter by compatible issue category/asset type;
3. use temporal relevance when appropriate;
4. compare the new report against the small set of nearby/category-compatible candidate incidents using Gemini;
5. consider media/visual and textual evidence where available;
6. score candidate incidents.

## 8.2 Outcomes

- high-confidence match: attach the report to the existing incident;
- ambiguous: create a merge-review candidate or hold for automatic follow-up;
- clear non-match: create a new incident.

## 8.3 Merge safety

CivicPulse must avoid merging different potholes/drains/poles on the same road merely because text is similar.

Admin users require tooling to:

- merge incidents;
- split incorrectly merged incidents;
- move reports between incidents;
- preserve redirect/history relationships.

---

# 9. AI government responsibility routing

This is a foundational CivicPulse differentiator.

## 9.1 Principle

AI should determine which government organizations ought to attend to an incident **after** CivicPulse has deterministically established location/jurisdiction and built a constrained set of verified organizations eligible for that place.

The model must not browse or hallucinate arbitrary agencies during routing. It chooses only IDs supplied by CivicPulse.

## 9.2 Candidate organization hierarchy

For a report in an LGA, candidates can include:

- LGA organizations for that LGA;
- state organizations for the containing state;
- federal organizations with nationwide or relevant asset/service jurisdiction.

The candidate pool is further filtered by:

- active verification status;
- mandate categories;
- responsibilities/exclusions;
- geographic coverage;
- asset types/ownership;
- parent/supervising relationships;
- organization operational status.

## 9.3 Organization mandate profile

Routing quality depends on high-quality government registration data. Each government organization must include authoritative information such as:

- official legal name and acronym;
- logo;
- government level;
- organization type;
- parent/supervising body;
- jurisdiction/coverage;
- official mandate text;
- structured responsibilities;
- structured exclusions/non-responsibilities;
- supported issue categories;
- asset types owned/maintained/regulatory oversight;
- legislation, gazette, official website, policy, or authorized-admin source for the mandate;
- source URL/document and effective dates;
- escalation contacts;
- organization status;
- designated CivicPulse officers/managers.

## 9.4 Asset ownership

Where possible, CivicPulse maintains a public infrastructure asset registry with:

- asset type;
- name/identifier;
- geometry/location;
- ownership government level;
- owning organization;
- maintaining organization;
- regulatory organization;
- source/evidence;
- effective dates.

A road located inside one LGA may still be a federal or state road, so physical location alone is not enough.

## 9.5 Responsibility output

The AI returns structured results containing:

- `primaryOrganizationId` when a clear primary exists;
- `coResponsibleOrganizationIds`;
- `supportingOrganizationIds`;
- per-organization reason;
- confidence;
- evidence/mandate references from the supplied organization records;
- candidates rejected and why;
- missing information;
- `reviewRequired`.

## 9.6 Safety rails

- AI may only return supplied organization IDs.
- AI must explain responsibility using the supplied mandate/asset/jurisdiction evidence.
- Low-confidence or conflicting results become `ROUTING_REVIEW_REQUIRED`.
- Authorized admins/government managers can correct routing; corrections require reasons and are audited.
- Human corrections are retained as evaluation data for future prompt/routing improvements.

---

# 10. Citizen public feed

## 10.1 Feed purpose

The feed gives citizens a reason to use CivicPulse even when they are not submitting a report. It makes civic issues and government response visible locally.

## 10.2 Feed is incident-centric

Do not show 40 near-identical raw posts for 40 reports of one pothole. Show one incident card with:

- title/category;
- approximate public-safe location;
- distance/area relevance;
- number of independent reports;
- number of affected confirmations;
- media preview after moderation;
- current official status;
- community verification state;
- assigned government organizations;
- latest meaningful update;
- age;
- upvotes/downvotes;
- comment count;
- follow/confirm/add-evidence actions.

## 10.3 Feed ranking

“Demographics” in CivicPulse should primarily mean civic/geographic context rather than sensitive personal profiling.

Ranking signals may include:

- current/home/followed location areas;
- proximity;
- followed LGA/state/organizations/categories;
- issue urgency;
- incident freshness;
- recent government/NGO activity;
- unresolved duration;
- trusted community engagement;
- user interaction history;
- incident importance.

Do not use sensitive attributes such as ethnicity, religion, political affiliation, or health data for feed ranking.

## 10.4 Feed tabs/filters

Recommended initial surfaces:

- For You;
- Nearby;
- Following;
- LGA;
- State;
- National/Trending;
- category filters;
- status filters.

## 10.5 Votes vs civic evidence

CivicPulse may expose upvote/downvote on incidents and public updates, but votes must not directly determine severity or institutional priority.

Also support stronger civic actions:

- `I_AM_AFFECTED`;
- `I_CAN_CONFIRM`;
- `ADD_EVIDENCE`;
- `FOLLOW`;
- `VERIFY_RESOLUTION`;
- `DISPUTE_RESOLUTION`.

A sewage issue affecting 30 people cannot become less important than a popular university-area pothole merely because the latter gets more votes.

---

# 11. Comments and public discussion

Citizens, verified government organizations, verified NGOs, and CivicPulse system actors may participate in public discussion according to permissions.

Requirements:

- threaded replies;
- edit history for meaningful edits or time-limited edit policy;
- deleted/taken-down state instead of destructive erasure where audit/legal policy requires;
- clear badges for verified government and NGO accounts;
- rate limiting;
- abuse/report controls;
- moderation status;
- anti-spam protections;
- mention support where safe;
- links/media according to moderation policy;
- no public display of private reporter identity unless the user opts in.

Government replies should be attributable to the organization and, internally, the responsible officer. Public display of individual officer name can be configurable by organization policy.

---

# 12. Government dashboard

## 12.1 Main surfaces

- Overview/operational inbox;
- assigned incidents;
- map view;
- routing review;
- incident details/timeline;
- cross-organization coordination;
- public updates;
- status changes;
- resolution evidence;
- NGO intervention proposals;
- organization profile/mandate data;
- member/team management;
- SLA/performance analytics;
- notifications.

## 12.2 Incident workflow

Suggested default official states:

- `OPEN`;
- `ACKNOWLEDGED`;
- `UNDER_REVIEW`;
- `IN_PROGRESS`;
- `RESOLUTION_SUBMITTED`;
- `RESOLVED`;
- `CLOSED`;
- `REJECTED_INVALID`;
- `DUPLICATE` (normally hidden because reports attach to incidents instead);
- `BLOCKED`/`ON_HOLD` with reason where necessary.

State transitions are backend-enforced. Each state transition records actor, organization, timestamp, reason, evidence requirement, and prior/new state.

## 12.3 Government public updates

Government users can publish updates such as:

- acknowledgement;
- inspection scheduled/completed;
- clarification;
- work planned;
- funding/procurement dependency;
- delay notice;
- work started;
- milestone;
- resolution submitted;
- general update.

Updates appear on the incident timeline and can receive votes/comments.

## 12.4 Resolution

Government cannot simply hide an issue by changing a field.

A resolution submission should contain appropriate evidence such as:

- resolution statement;
- before/after media where relevant;
- completion date;
- organization(s);
- contractor/intervention details when applicable;
- supporting documents if policy allows public display;
- inspection/acceptance data.

Then the community may independently verify/challenge.

---

# 13. Community verification of resolution

Maintain two concepts:

1. **Official government status** — controlled by authorized government workflow.
2. **Community verification status** — derived from post-resolution citizen evidence and confirmations.

Community states may include:

- `UNVERIFIED`;
- `COMMUNITY_CONFIRMED`;
- `COMMUNITY_DISPUTED`;
- `REVIEW_REQUIRED`.

Example:

- Official status: `RESOLVED`.
- Community verification: `COMMUNITY_DISPUTED`.
- 34 nearby/affected residents say the issue remains.
- 7 new pieces of evidence were uploaded.

CivicPulse must represent this truthfully without falsely declaring either side automatically correct.

A dispute can trigger government re-review or platform moderation/routing review depending on policy.

---

# 14. NGO dashboard

## 14.1 Issue discovery

Verified NGOs can browse/filter incidents by:

- geographic area;
- category/subcategory;
- affected asset;
- severity/risk;
- age;
- official status;
- community verification;
- people/independent reports affected;
- government acknowledgment state;
- NGO focus area;
- likely intervention type;
- government level;
- existing interventions.

## 14.2 NGO participation types

An NGO can propose:

- full funding;
- co-funding;
- execution;
- funding + execution;
- supply of materials;
- technical expertise;
- community mobilization;
- monitoring/independent verification;
- advocacy/escalation;
- other structured assistance.

## 14.3 Intervention workflow

Recommended lifecycle:

1. Issue discoverable.
2. NGO expresses interest.
3. NGO creates proposal.
4. Proposal submitted.
5. Responsible government authority reviews.
6. Changes requested / rejected / approved in principle.
7. Required permits/approvals documented.
8. Authorized to commence.
9. Work in progress.
10. Milestones/evidence submitted.
11. NGO submits completion.
12. Government inspection/acceptance.
13. Remediation if needed.
14. Handover.
15. Incident resolution/community verification continues.

## 14.4 CivicPulse does not issue a universal infrastructure permit

There is no assumption of one nationwide “NGO infrastructure repair permit.” Required approvals vary by asset, jurisdiction, scope, funding source, and regulator.

The responsible government organization configures or confirms the required approvals. CivicPulse records them as structured `RequiredApproval` records.

---

# 15. CivicPulse admin dashboard

## 15.1 Organization approvals

Admins review:

- government organization applications;
- NGO applications;
- official registration/identity evidence;
- domains/contact verification;
- mandate documents;
- logo/branding;
- jurisdiction/service area;
- parent relationships;
- organization membership requests.

## 15.2 Routing administration

Admins can:

- inspect AI routing decisions and evidence;
- approve/override ambiguous routing;
- correct organization metadata;
- manage mandate embeddings/indexing;
- manage asset ownership records;
- review routing evaluation statistics.

## 15.3 Incident administration

- merge/split incidents;
- move reports;
- correct categories;
- handle fraudulent reports;
- manage sensitive media visibility;
- manage legal takedown flags;
- preserve audit trail.

## 15.4 Moderation

- comment/reply queues;
- media/publication review;
- harassment/doxxing/defamation/spam queues;
- account restrictions;
- appeal handling;
- government/NGO impersonation reports.

## 15.5 Boundary/taxonomy administration

- import/version government boundaries;
- validate geometries;
- manage LGA/state hierarchy;
- manage issue category taxonomy;
- manage asset types;
- manage intervention types.

## 15.6 System operations

- queue health;
- failed jobs;
- media upload verification or background-processing failures;
- AI processing failures;
- integration health;
- audit search;
- feature flags/configuration where supported.

---

# 16. Organization onboarding requirements

Detailed field lists are in `06_GOVERNMENT_NGO_ONBOARDING_AND_INTERVENTIONS.md`. Product requirements are summarized here.

## 16.1 Government organizations must provide

At minimum:

- official name;
- acronym;
- logo;
- government level;
- organization type;
- jurisdiction/service area;
- official website;
- official email/domain;
- official address/contact;
- legal/official establishment source;
- mandate text;
- responsibilities;
- exclusions;
- categories handled;
- asset types handled/owned/maintained/regulated;
- parent/supervising organization;
- designated administrators;
- source links/documents supporting mandate and responsibility.

## 16.2 NGOs must provide

At minimum:

- legal name;
- public name/acronym;
- logo;
- CAC/other lawful registration data where applicable;
- legal form;
- official website/contact;
- constitution/objective/mission summary;
- focus areas;
- geographic scope;
- intervention capabilities;
- funding/execution capabilities;
- relevant professional/technical capacity where physical infrastructure work is proposed;
- previous project references where available;
- designated organization administrators;
- compliance/registration documents required by policy.

CivicPulse must minimize unnecessary personal data and avoid publicly exposing trustee/director personal data merely because verification required it.

---

# 17. Notifications

Users should be able to receive in-app and configured external notifications for meaningful events.

Citizen examples:

- report processed;
- attached to existing incident;
- government assigned;
- government update;
- NGO intervention update;
- status change;
- resolution submitted;
- community verification requested;
- reply/mention.

Government examples:

- new assignment;
- routing review;
- SLA approaching/expired;
- high-confidence new evidence;
- incident escalation;
- NGO proposal;
- resolution dispute;
- reply/mention.

NGO examples:

- proposal status;
- changes requested;
- approval granted;
- permit requirement;
- government message;
- milestone due;
- handover/inspection result.

Notifications must be deduplicated, preference-aware, and rate-limited.

---

# 18. Search and discovery

Support search across:

- incidents;
- locations;
- categories;
- government organizations;
- NGOs;
- public updates;
- public-safe comments where policy allows.

Initial search should use PostgreSQL full-text search and indexed filters. Add a dedicated search or vector system only when measured scale or retrieval quality proves it is necessary.

---

# 19. Public organization profiles and transparency metrics

Government organization profiles may show:

- verification status;
- official mandate summary;
- jurisdictions;
- assigned/open incidents;
- acknowledgement rate;
- median acknowledgement time;
- median resolution time;
- overdue incidents;
- resolved count;
- community-confirmed resolution rate;
- public updates;
- active NGO interventions involving the organization.

Avoid creating a single opaque “performance score” in the first release. Prefer transparent raw metrics with definitions and sample sizes.

NGO profiles may show:

- verification status;
- focus areas;
- geographic coverage;
- proposed/approved/completed interventions;
- published milestones;
- completed public impact records;
- government acceptance/handover outcomes.

---

# 20. Privacy and public location rules

Precise citizen location can be sensitive. Public views should generally show the incident location necessary to understand the civic issue, not the reporter’s home/location history.

Rules:

- do not expose a reporter’s raw GPS trail;
- do not publicly expose EXIF location metadata;
- incident map location may be public where necessary to identify a public infrastructure problem;
- reports originating at private residences require redaction/coarsening review;
- identity is private by default unless the citizen explicitly chooses a public profile/name;
- public media may require blur/redaction/moderation;
- originals remain restricted evidence.

---

# 21. Content moderation and trust

CivicPulse must handle:

- spam;
- fake reports;
- duplicate abuse;
- bots;
- harassment;
- threats;
- doxxing;
- defamatory allegations;
- political propaganda/off-topic campaigning;
- pornographic/graphic media;
- images of minors;
- phone numbers/private addresses;
- government/NGO impersonation;
- vote manipulation;
- coordinated brigading;
- AI-generated/fabricated evidence.

Moderation combines automated screening, deterministic rules, user reports, rate limits, trust signals, and human admin review.

Public user allegations must be clearly presented as user-generated content, not verified CivicPulse facts.

---

# 22. UX requirements by actor

## 22.1 Citizen

- mobile-first responsive;
- report in very few steps;
- media capture/upload progress;
- resilient to poor connections;
- draft preservation;
- clear processing state;
- plain-language status terminology;
- no forced bureaucracy;
- accessible controls;
- clear distinction between official vs community status;
- transparent reason when AI is uncertain.

## 22.2 Government

- operational, not social-media styled;
- clear queues/priorities;
- map + table views;
- bulk-safe actions only where appropriate;
- explicit evidence/rationale for AI routing;
- no hidden state changes;
- collaboration across organizations;
- quick public update composer with appropriate review controls.

## 22.3 NGO

- issue discovery should feel like an opportunity/needs marketplace without commodifying communities;
- filters must be powerful but understandable;
- intervention proposal wizard should make approval requirements explicit;
- proposal status should never be ambiguous;
- documents/milestones should be easy to manage.

## 22.4 Admin

- high information density;
- strong filtering/search;
- all dangerous actions require explicit confirmation and reasons;
- every override auditable;
- system-health context available.

All UI implementations must follow repository `docs/design.md`.

---

# 23. High-level success metrics

Product metrics should be segmented by geography and organization maturity.

Suggested metrics:

- report submission completion rate;
- median time from submit to processed report;
- report-to-incident deduplication rate;
- AI routing auto-resolution vs review rate;
- routing correction rate;
- time to government acknowledgement;
- percentage of incidents with public updates;
- time to resolution;
- community resolution verification rate;
- reopened/disputed resolution rate;
- NGO interest-to-approved-intervention conversion;
- intervention completion/handover rate;
- percentage of incidents with independent evidence;
- moderation action rate;
- feed engagement that results in meaningful civic actions, not only votes.

---

# 24. Core end-to-end citizen story

1. Citizen notices blocked drainage.
2. Opens CivicPulse and records a Nigerian Pidgin voice note plus a photo.
3. Browser captures GPS; user confirms the pin.
4. Media uploads directly to Cloudinary using server-signed parameters.
5. CivicPulse immediately creates the report and returns a receipt.
6. Worker processes audio/image with Gemini.
7. Gemini detects Nigerian Pidgin, preserves transcript, translates to English, extracts `DRAINAGE_BLOCKAGE` and `FLOOD_RISK`.
8. PostGIS maps the point to an LGA and state.
9. Duplicate matcher finds an existing drainage incident 40m away and attaches the report.
10. If responsibility is not already settled or the new evidence changes scope, the responsibility router considers verified LGA/state/federal candidates and their mandates.
11. Government organizations receive assignment/notification.
12. The incident appears in nearby citizen feeds with aggregated report count.
13. Citizens comment, upvote/downvote, follow, confirm they are affected, and add evidence.
14. Government acknowledges and publishes an inspection update.
15. An NGO focused on WASH discovers the incident and proposes materials + co-funding.
16. Government reviews and approves the intervention subject to documented conditions.
17. NGO work/milestones appear on the timeline.
18. Government submits acceptance/resolution evidence.
19. Nearby/affected citizens verify or dispute the outcome.
20. Incident closes only according to configured official/community workflow; all history remains auditable.

---

# 25. Product assumptions for first implementation

These defaults should unblock implementation. Codex should ask only if a real dependency arises that requires a different product decision.

- Citizen account is required for comments, votes, follow, affected-confirmation, and evidence submission.
- A submitted report is internally attributable to an authenticated citizen account, but reporter identity is **not public by default**.
- Government/NGO users are ordinary users plus verified `OrganizationMembership` roles.
- Government/NGO organization onboarding requires CivicPulse admin verification before privileged functionality.
- A government organization may manage several operational subunits later; initial implementation can model parent/child organizations explicitly rather than inventing free-form department strings.
- Physical NGO interventions cannot enter `AUTHORIZED_TO_COMMENCE` until required approval records are satisfied.
- AI output never directly mutates official status without an authorized backend command.
- CivicPulse can auto-create AI responsibility assignments at high confidence, but authorized humans can review/override with an audit reason.
- Public feed location must be privacy-safe; precise coordinates remain available to authorized operational users where appropriate.

---

# 26. Future extensions intentionally supported by the model

The architecture should not implement these prematurely, but must not block them:

- native mobile clients;
- SMS/USSD report intake;
- WhatsApp intake;
- additional Nigerian/African languages;
- public API/Open Data exports;
- asset sensor/IoT evidence;
- corporate CSR dashboard;
- donor/development-agency funding;
- contractor/vendor integration;
- procurement system integration;
- emergency escalation integrations;
- government SSO;
- advanced forecasting/heatmaps;
- model evaluation dashboards;
- external fact/mandate registry integrations.
