# CivicPulse Government & NGO Onboarding, Verification, and Intervention Specification

**Purpose:** Define exactly what data CivicPulse must collect to understand institutional responsibility, verify organizations, route incidents, and coordinate lawful/approved NGO interventions.

**Important:** This is a product/engineering specification, not legal advice. Infrastructure approvals vary by asset, jurisdiction, funding source, scope, and law. CivicPulse must record and coordinate approvals; it must not pretend one universal workflow is legally sufficient everywhere.

---

# 1. Why organization data quality is foundational

The Responsibility Routing Agent is only as good as the verified institutional data CivicPulse provides to it.

The AI is intentionally not asked:

> “Search the internet and guess who owns this pothole.”

Instead CivicPulse determines the geographic hierarchy and supplies a verified candidate set containing structured mandates and official evidence. The model reasons only across those candidates.

Therefore government onboarding is not just account registration. It is the construction of a **verified responsibility directory**.

---

# 2. Shared organization identity fields

Collect for both government organizations and NGOs where applicable:

- legal/official name;
- public display name;
- acronym;
- slug;
- official logo;
- organization type;
- public description;
- official website;
- official email;
- official email domain(s);
- phone/contact lines;
- public office address;
- social links optional;
- parent/supervising organization where applicable;
- designated CivicPulse organization administrators;
- verification status;
- active/suspended status;
- onboarding submission timestamps;
- source documents;
- admin review notes (private);
- next review/renewal date where applicable.

Logo files must be uploaded through the same secure media infrastructure, with organization-branding purpose separate from citizen evidence.

---

# 3. Government organization onboarding

## 3.1 Identity and government hierarchy

Required:

- government level: `FEDERAL`, `STATE`, `LGA`;
- organization type: ministry, agency, authority, department, unit, commission, corporation, etc.;
- jurisdiction/service area;
- state for state organizations;
- LGA for local organizations;
- nationwide flag for eligible federal organizations;
- parent/supervising organization;
- subordinate organizations where known;
- legal/official establishment name.

## 3.2 Mandate information

Collect both raw authoritative text and structured fields.

### Raw/authoritative

- mandate text/excerpt;
- establishment law/gazette/policy/official page title;
- source URL;
- uploaded official document if needed;
- issuing authority;
- effective date;
- version;
- verification date.

### Structured

- responsibilities[];
- explicit exclusions[];
- issue categories[];
- asset types[];
- responsibility mode per asset where useful: `OWNER`, `MAINTAINER`, `REGULATOR`, `OPERATOR`, `POLICY`, `EMERGENCY_SUPPORT`;
- geographic scope;
- conditions/limitations;
- escalation/supervising body.

Examples of useful structured statements:

- maintains state-owned roads;
- does not maintain federal highways;
- owns public water assets within specified state;
- handles waste collection in listed LGAs;
- regulates but does not directly repair distribution infrastructure.

## 3.3 Operational responsibility contacts

Collect:

- CivicPulse organization admin;
- incident intake contact/team;
- escalation contact/team;
- intervention approval contact/team;
- public communications contact if required;
- official email aliases;
- working hours/operational notes optional.

Avoid storing unnecessary personal data. Prefer role/group contact over personal phone number where possible.

## 3.4 Workflow configuration

Government org can eventually configure:

- acknowledgement SLA;
- review SLA;
- allowed incident transitions;
- roles allowed to resolve;
- evidence requirements by category;
- NGO proposal approver roles;
- additional approval templates;
- public officer-name visibility policy;
- escalation rules.

Initial defaults may come from CivicPulse, but configured values are versioned/audited.

---

# 4. Government verification workflow

Suggested states:

- `DRAFT`;
- `SUBMITTED`;
- `IDENTITY_REVIEW`;
- `MANDATE_REVIEW`;
- `CHANGES_REQUESTED`;
- `APPROVED`;
- `REJECTED`;
- `SUSPENDED`;
- `REVERIFICATION_REQUIRED`.

Admin verification checks:

1. organization exists;
2. applicant is authorized to represent it;
3. official email/domain/contact is credible;
4. logo/name match official sources;
5. government level/jurisdiction is correct;
6. parent relationships are correct;
7. mandate sources are authoritative enough;
8. structured responsibilities reflect the source;
9. exclusions are captured where known;
10. duplicate organization does not already exist.

Do not auto-verify based only on email domain.

---

# 5. Government organization mandate embeddings

After approval:

1. create a normalized mandate document combining verified mandate text, responsibilities, exclusions, asset types and geographic scope;
2. generate embedding with configured real embedding model;
3. store model/version/content hash;
4. use in routing candidate retrieval;
5. regenerate when mandate profile changes;
6. preserve old routing-run references to the prior version for audit.

---

# 6. Government asset registry

Asset data materially improves routing.

Fields:

- asset name/identifier;
- asset type;
- point/line/polygon geometry;
- owner organization;
- maintainer organization;
- operator;
- regulator;
- government level;
- source;
- source date/version;
- effective dates;
- confidence/verification state;
- external ID;
- public visibility.

Examples:

- federal road segment;
- state road;
- drainage channel;
- public school building;
- market;
- waterworks;
- bridge;
- public streetlight corridor.

Do not fabricate asset ownership to avoid a routing review.

---

# 7. NGO onboarding

NGO onboarding has two goals:

1. verify the organization is real/authorized;
2. understand what it is actually capable of supporting.

## 7.1 Legal identity

Depending on legal form, collect:

- legal name;
- registration authority;
- registration number;
- legal form (e.g. incorporated trustee, company limited by guarantee, other recognized structure);
- incorporation/registration date;
- certificate/document;
- constitution/objectives or equivalent governing document where appropriate;
- current status evidence if available;
- official website/email/domain;
- office address;
- designated admins.

For Nigerian incorporated trustees, CAC's current official registration process includes organization constitution and trustee-related documentation. CivicPulse should verify entity status without publishing private trustee information unnecessarily.

## 7.2 Mission and focus

Collect:

- mission/objectives summary;
- focus areas (WASH, education, roads, disability access, environment, health infrastructure, etc.);
- SDGs optional;
- geographic scope: national/state/LGA/community;
- communities served;
- beneficiary restrictions if relevant;
- advocacy vs physical-execution capability.

## 7.3 Intervention capabilities

Explicitly ask what the NGO can do:

- fund;
- co-fund;
- execute civil works;
- procure/supply materials;
- provide engineering/technical expertise;
- conduct assessment/research;
- community mobilization;
- independent monitoring;
- advocacy/escalation;
- volunteer labor where lawful;
- other.

## 7.4 Technical capacity for physical work

If NGO wants to execute infrastructure work, collect appropriate capability evidence such as:

- relevant professional team/certifications where legally necessary;
- contractor/implementation partner structure;
- health/safety policy;
- previous relevant projects;
- references/completion reports;
- insurance where required by project/authority;
- procurement/internal control approach where relevant.

Do not require every advocacy NGO to upload engineering documents it does not need.

## 7.5 Funding profile

Optional/private where appropriate:

- types of funding the NGO can deploy;
- typical intervention size ranges;
- donor restrictions;
- co-funding ability;
- whether it can only implement donor-funded work;
- preferred locations/categories.

Do not publicly expose sensitive financial data by default.

---

# 8. NGO verification states

- `DRAFT`;
- `SUBMITTED`;
- `IDENTITY_REVIEW`;
- `CAPABILITY_REVIEW`;
- `CHANGES_REQUESTED`;
- `VERIFIED`;
- `REJECTED`;
- `SUSPENDED`;
- `REVERIFICATION_REQUIRED`.

Privileges:

- unverified NGO: public browsing only as ordinary user;
- verified NGO: organization dashboard, express interest, proposal submission;
- verified + appropriate capability: may propose execution roles, still subject to government approval.

---

# 9. NGO issue discovery

The NGO dashboard should allow filters by:

- LGA/state;
- distance/region;
- issue category;
- affected asset type;
- severity/risk;
- incident age;
- government status;
- government assigned/acknowledged;
- report/affected counts;
- existing intervention status;
- intervention capability match;
- NGO focus area match.

Recommendation/ranking may use the NGO's declared focus and geographic scope, not sensitive citizen data.

---

# 10. Express interest vs claim issue

The action is **Express Interest** or **Propose Intervention**, never “claim ownership.”

An expression of interest records:

- NGO;
- incident;
- intended participation type;
- short note;
- contact team;
- timestamp;
- public/private visibility.

It does not authorize physical work.

---

# 11. Intervention proposal fields

A proposal should support:

- incident;
- lead NGO;
- partner organizations;
- intervention type(s);
- problem understanding;
- proposed scope;
- exclusions;
- funding source;
- proposed budget and currency;
- funding committed vs sought;
- implementation method;
- contractor/technical partner if known;
- planned dates;
- milestone plan;
- technical assessment;
- designs/BOQ where appropriate;
- safety/risk plan;
- traffic/community management where applicable;
- environmental considerations;
- requested government action/approval;
- supporting documents.

Use progressive disclosure: simple interventions should not feel like giant construction tenders.

---

# 12. Government intervention review

The competent authority sees:

- incident evidence;
- NGO verification/capabilities;
- proposal;
- asset ownership;
- other assigned government organizations;
- required approvals;
- overlapping existing work/procurement;
- public safety implications.

Possible decisions:

- `CHANGES_REQUESTED`;
- `REJECTED` with reason;
- `APPROVED_IN_PRINCIPLE`;
- later `AUTHORIZED_TO_COMMENCE` after all required approvals.

---

# 13. Required approvals model

CivicPulse should not hard-code one nationwide permit.

Each intervention can have multiple `RequiredApproval` records:

```text
RequiredApproval
- authorityOrganizationId
- approvalType
- reason/legalOrOperationalBasis
- requiredDocuments
- status
- conditions
- issuedDocument
- issuedAt
- expiresAt
- reviewer
```

Examples depending on project:

- asset owner consent;
- ministry/agency technical approval;
- site access/right-of-way;
- traffic management approval;
- utility clearance;
- planning/building approval;
- environmental screening/EIA process;
- procurement compliance when public funds are involved;
- safety inspection;
- community consultation;
- final handover acceptance.

Only the competent authority/regulator can mark its approval as satisfied unless CivicPulse has a verified integration/delegation allowing otherwise.

---

# 14. Nigerian legal/operational context captured by product design

## 14.1 NGO legal existence

Nigeria's Corporate Affairs Commission is the official corporate registry and provides an Incorporated Trustees registration pathway for many associations/charitable bodies. CivicPulse can use CAC documentation/entity data as one verification source, but CAC registration by itself does not authorize an NGO to alter public infrastructure.

## 14.2 Asset authority matters

Public infrastructure responsibilities differ by asset and government level. For example, FERMA's official materials describe its federal-road maintenance mandate. A road physically inside an LGA may therefore remain a federal/state asset.

CivicPulse must first identify the competent asset owner/authority before NGO work authorization.

## 14.3 Environmental approval can be project-specific

The Federal Ministry of Environment Environmental Assessment Department describes project registration, screening/scoping, EIA review and permit functions. CivicPulse should support environmental approval requirements where a competent authority says the intervention scope triggers them; it must not assume every pothole repair needs an EIA.

## 14.4 Public funding changes process

Nigeria's Bureau of Public Procurement publishes the Public Procurement Act and federal procurement procedures. When federal public funds/procurement are involved, procurement requirements may apply. State/local rules may differ.

Therefore intervention records must capture `fundingSource` and required authority approvals.

---

# 15. Intervention status machine

Recommended:

```text
DRAFT
  ↓
SUBMITTED
  ↓
UNDER_REVIEW
  ├── CHANGES_REQUESTED -> DRAFT/RESUBMITTED
  ├── REJECTED
  ↓
APPROVED_IN_PRINCIPLE
  ↓
AWAITING_APPROVALS
  ↓
AUTHORIZED_TO_COMMENCE
  ↓
IN_PROGRESS
  ↓
COMPLETION_SUBMITTED
  ↓
INSPECTION
  ├── REMEDIATION_REQUIRED -> IN_PROGRESS
  ↓
ACCEPTED
  ↓
HANDOVER_COMPLETE
```

Do not let NGO users manually skip states.

---

# 16. Public transparency for interventions

Public incident timeline can show, subject to document/privacy policy:

- NGO expressed interest;
- proposal submitted;
- government approved/rejected;
- conditions/approval status summary;
- work authorized;
- work started;
- milestones;
- completion submitted;
- government inspection;
- handover;
- funding source/type;
- verified organizations involved.

Private documents such as personal IDs, bank details, sensitive contracts, or security-sensitive infrastructure plans must not become public merely because the timeline is public.

---

# 17. Completion and handover

NGO completion submission may include:

- completion report;
- before/after evidence;
- engineer/technical certification where required;
- final cost/funding disclosure according to policy;
- milestone reconciliation;
- deviations from approved scope;
- maintenance/handover notes.

Government authority can:

- accept;
- require remediation;
- reject completion;
- request additional evidence.

Acceptance can contribute to incident `RESOLUTION_SUBMITTED/RESOLVED`, but the community verification flow remains separate.

---

# 18. Organization data change management

Government mandates, names, leadership, boundaries and NGO registration/capabilities change over time.

Requirements:

- version mandate profile changes;
- re-verify material changes;
- regenerate embeddings;
- never rewrite old RoutingRun evidence;
- inactive organizations stop receiving new routes;
- assignments to dissolved/renamed organizations remain historically attributable;
- parent/merger relationships supported.

---

# 19. Admin UX requirements

Organization review screen should clearly show:

- application data;
- uploaded logo/documents;
- source URLs;
- duplicate/similar organizations;
- jurisdiction map;
- structured mandate/responsibility preview;
- applicant/member details privately;
- audit history;
- approve/request changes/reject actions.

High-risk approval should require reason/confirmation and appropriate admin privilege.

---

# 20. Data minimization rules

Collect the organization data needed for verification/routing/intervention — not every piece of personal information available in source documents.

Examples:

- store NGO trustees/directors only where verification/legal policy requires it;
- do not expose personal addresses/IDs publicly;
- prefer role emails for government contacts;
- redact private registration documents from public views;
- define retention policy for rejected applications.

---

# 21. Official sources to keep in the engineering reference library

- Nigeria Corporate Affairs Commission — Incorporated Trustees/current entity verification documentation.
- Nigeria Data Protection Commission — NDP Act 2023 and current implementation guidance.
- Federal Roads Maintenance Agency — FERMA Act/official mandate materials.
- Federal Ministry of Environment Environmental Assessment Department — EIA processes/mandate.
- Bureau of Public Procurement — Public Procurement Act and current federal procurement documents.
- Relevant state/LGA legislation/official sites for organizations actually onboarded.

For each government organization onboarded, verification should prioritize official source material specific to that organization rather than relying on generalized assumptions.
