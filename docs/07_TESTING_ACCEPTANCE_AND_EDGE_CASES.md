# CivicPulse Testing, Acceptance and Edge Cases

The application must be tested as a real product, not merely compiled.

Canonical stack under test:

- React + Vite frontend;
- Express + TypeScript API;
- PostgreSQL + PostGIS;
- Graphile Worker;
- Cloudinary;
- Gemini.

No Redis/BullMQ/webhook/outbox tests are required because those components are not part of this architecture.

---

# 1. Test layers

## Unit

Test pure rules such as:

- valid status transitions;
- role permissions;
- feed ranking helper;
- routing confidence thresholds;
- visibility rules;
- intervention transition rules.

## API integration

Run Express against a real dedicated PostgreSQL/PostGIS test database.

Use Supertest or equivalent.

## Worker integration

Run Graphile Worker tasks against the real test database.

## Provider contract

Use dedicated real Cloudinary/Gemini credentials when verifying those integrations.

## Browser E2E

Playwright runs against the actual Vite app + Express API + database + worker.

---

# 2. Global release rule

No release with:

- failing typecheck;
- failing production build;
- failing migrations;
- failing tests;
- active button that is known not to work;
- hidden console errors on core journeys;
- fake external integration result;
- unverified provider integration represented as passed.

---

# 3. Authentication tests

Test:

- register valid user;
- duplicate email;
- invalid email/password;
- email verification;
- login;
- wrong password;
- logout;
- session expiry/revocation;
- forgot/reset password;
- protected route without session;
- user cannot forge role/membership;
- removed organization member loses permissions;
- account disabled behavior.

---

# 4. Government onboarding tests

Test complete onboarding with required details:

- legal/official name;
- logo;
- government level;
- organization type;
- jurisdiction;
- parent/supervising body;
- mandate;
- responsibilities;
- exclusions;
- issue categories;
- asset responsibilities;
- official source links/documents;
- contacts.

Test:

- incomplete application;
- duplicate org;
- invalid source URL/file;
- admin approve;
- admin reject/request changes;
- approved org member access;
- unverified org cannot publish as verified government.

---

# 5. NGO onboarding tests

Cover legal registration, logo, focus areas, geography, capabilities, contacts, project history/supporting documents and admin verification.

Unverified NGO must not submit formal intervention proposal if policy requires verification.

---

# 6. Cloudinary tests

Real integration test where credentials exist:

1. authenticated user requests signed upload parameters;
2. unauthorized user cannot request them where auth is required;
3. wrong/unsupported MIME rejected;
4. oversized file rejected according to configured limits;
5. browser uploads real small image directly;
6. backend verifies returned asset;
7. fake/nonexistent asset ID rejected;
8. private evidence cannot be fetched without authorization;
9. permitted requester can receive valid signed delivery URL;
10. upload failure leaves report draft recoverable.

No webhook test exists.

---

# 7. Report submission tests

Text-only report.

Image report.

Voice-note report.

Video report.

Mixed text + media.

Test:

- location permission granted;
- location permission denied then user manually selects pin;
- GPS inaccurate warning/confirmation;
- missing required location;
- submit twice rapidly;
- upload succeeds but submit fails;
- submit succeeds and page refreshes;
- draft editing;
- media remove/re-upload;
- anonymous reporting only if PRD explicitly allows it; otherwise ensure login required.

---

# 8. Worker/Gemini tests

With real provider credentials when available:

- English text;
- Yoruba speech sample;
- Hausa speech sample;
- Igbo speech sample;
- Nigerian Pidgin speech sample;
- other/unknown language;
- noisy audio;
- audio with little/no speech;
- image with clear civic issue;
- image with no civic issue;
- video containing relevant visual + spoken evidence;
- unsupported/corrupt media;
- Gemini timeout/error;
- invalid structured result;
- semantically impossible result caught by application validation;
- retry then success;
- repeated job does not create duplicate incident.

Provider limitations should be respected; use small dedicated test assets.

---

# 9. Jurisdiction tests

Using test boundary fixtures and separate verification against production dataset procedures:

- point clearly in LGA;
- point near boundary;
- point outside loaded coverage;
- overlapping/bad boundary data;
- inactive/outdated boundary;
- PostGIS spatial index/query works;
- AI is never used to override unresolved containment.

---

# 10. Incident matching tests

- same category + 10m away + similar description => match expected;
- same category but clearly different asset/problem => new incident;
- two potholes on same long road => do not blindly merge;
- old resolved issue reappears => product rule applied (new/reopened) correctly;
- candidate list empty => new incident;
- ambiguous comparison => review;
- admin merge;
- admin split;
- report counts/timeline corrected after merge/split.

---

# 11. Government routing tests

Construct real test organizations with explicit mandates.

Test:

- LGA-owned road issue;
- state road issue;
- federal road issue;
- drainage issue;
- multi-agency issue;
- candidate organization with explicit exclusion;
- relevant org inactive/unverified => excluded;
- no valid candidate => review/unroutable;
- close confidence => review;
- Gemini returns unknown ID => reject output;
- known asset owner strongly affects decision;
- missing asset ownership lowers confidence appropriately;
- manual admin override leaves audit record.

---

# 12. Feed tests

- nearby ranking;
- followed incident prioritization;
- new government update appears;
- NGO milestone appears if public;
- pagination/cursor;
- empty feed;
- private incident excluded;
- blocked/removed content excluded;
- feed does not show duplicate raw reports as separate primary posts when attached to same incident.

---

# 13. Interaction tests

- upvote;
- remove/change vote according to chosen UX;
- downvote;
- duplicate vote prevention;
- “I’m affected”;
- remove affected signal if allowed;
- comment;
- reply;
- edit/delete own comment according to policy;
- cannot edit another person's comment;
- report comment;
- follow/unfollow;
- add evidence;
- notification generated where required.

---

# 14. Government dashboard tests

For assigned incidents:

- list/filter/search;
- open detail;
- inspect evidence;
- see routing rationale;
- acknowledge;
- valid status transitions;
- invalid transition rejected by backend;
- add official public update;
- add private internal update if supported;
- attach evidence;
- request routing review;
- mark resolution with required evidence;
- respond to NGO proposal;
- unauthorized government organization cannot mutate incident.

---

# 15. Resolution transparency tests

- government marks resolved;
- resolution evidence appears publicly;
- citizen confirms;
- citizen disputes;
- official status remains distinguishable from community state;
- sufficient dispute signal displays correctly according to rules;
- government/admin review path works;
- closing incident preserves timeline.

---

# 16. NGO intervention tests

- discover eligible incident;
- express interest;
- submit each supported intervention type;
- required proposal fields validation;
- government requests changes;
- NGO resubmits;
- government approves in principle;
- required additional approval records;
- cannot start before authorized-to-commence;
- milestone upload;
- completion submission;
- government inspection/acceptance;
- handover;
- public timeline shows appropriate activity;
- rejected/withdrawn/expired proposal cases.

---

# 17. Admin tests

- government approve/reject;
- NGO approve/reject;
- mandate/source review;
- assign jurisdiction;
- boundary import validation;
- asset create/update;
- routing review/override;
- incident merge/split;
- moderation queue;
- hide/restore content;
- resolve/escalate resolution dispute;
- retry failed processing;
- audit log filters;
- admin cannot accidentally perform action without confirmation when destructive.

---

# 18. Security tests

- SQL injection probes;
- XSS in comments/report text/org profile;
- unauthorized object access / IDOR;
- cross-organization access;
- upload signature abuse;
- unsupported file type;
- private media authorization;
- role escalation attempts;
- session fixation/reuse/revocation;
- excessive request/rate limit behavior;
- backend remote-media fetch cannot be redirected to arbitrary internal URLs;
- secrets absent from frontend bundle/logs.

---

# 19. Accessibility/responsive tests

At minimum:

- keyboard navigation through major flows;
- visible focus;
- form labels/errors;
- modal focus handling;
- screen-reader-friendly buttons/icons;
- 44px touch targets where specified by design;
- mobile report flow;
- tablet dashboard;
- desktop dashboard;
- no horizontal overflow on supported viewport sizes;
- reduced-motion preference respected for decorative animation where appropriate.

---

# 20. Mandatory “click every button” release pass

Before declaring completion, Codex must create an inventory of all reachable routes and active controls for each role.

Then use Playwright/browser tooling to exercise every reachable active control, including:

- primary/secondary buttons;
- links;
- nav/mobile menu;
- tabs;
- dropdowns;
- filters;
- searches;
- pagination/load-more;
- forms;
- file uploads;
- audio recording controls if implemented;
- map location controls;
- dialogs/drawers;
- retry/cancel/remove;
- comments/replies;
- votes/signals/follow;
- government status/update controls;
- NGO proposal/approval/milestone controls;
- admin verification/moderation/routing/merge/split controls;
- logout/session controls.

For each important action verify:

1. browser behavior;
2. expected network request;
3. correct response/error;
4. database/business-state change;
5. refresh still shows correct persisted state.

Also inspect:

- browser console errors;
- failed network requests;
- broken links;
- loading states that never finish;
- double-submit behavior;
- obvious layout breakage.

An active control that only displays a fake toast or has no real backend behavior is a release blocker.

---

# 21. Final E2E acceptance journey

Perform a complete realistic journey:

```text
CivicPulse admin creates/verifies test government org and NGO
        ↓
citizen registers/logs in
        ↓
submits real report with real Cloudinary media + location
        ↓
worker runs real Gemini analysis
        ↓
PostGIS resolves jurisdiction
        ↓
incident matched/created
        ↓
AI routes to eligible test government organization
        ↓
government officer sees/acknowledges/updates incident
        ↓
public feed/timeline reflects update
        ↓
NGO discovers issue and proposes intervention
        ↓
government reviews/authorizes according to workflow
        ↓
NGO submits progress/completion
        ↓
government submits resolution
        ↓
citizen verifies/disputes
        ↓
public timeline remains coherent
```

Use a test environment/database and clearly test-only organizations. Do not seed fake data into production.

---

# 22. Final test report

Codex must finish with a table/list containing:

- test suite;
- command;
- result PASS/FAIL/BLOCKED;
- failures fixed;
- provider tests actually executed;
- browser routes/actions exercised;
- known unverified areas;
- production blockers.

It may declare “production ready” only if no known production blocker remains.
