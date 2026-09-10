# CivicPulse Design System

## Creative north star: Stable Grid, Living Signal

CivicPulse is a public accountability product with the friendliness and tactile clarity of a well-organized sticker book. Evidence, forms, tables, maps and status stay on a stable readable grid. The world around that content uses geometric shapes, hard shadows, dotted fields and short elastic motion to make civic participation approachable.

It must feel Nigerian, optimistic and useful without imitating a government seal, political campaign, fintech wallet or generic “AI for Africa” startup.

1. Stable grid, wild decoration: decoration never compromises reading or task completion.
2. Evidence before engagement: popularity never determines severity.
3. Friendly, not frivolous: playful geometry invites action while status remains precise.
4. Public by design, private by default: coarse locations and moderated derivatives are public; identities and originals remain restricted.
5. Two truthful states: official status and community verification remain distinct.

## Color tokens

The playful system retains CivicPulse’s Nigerian green identity.

### Light mode

```yaml
background: "#FFFDF5"
foreground: "#12231A"
surface: "#FFFFFF"
surface-muted: "#F1F6F3"
muted: "#E9EFEB"
muted-foreground: "#5C6F63"
border: "#C8D6CD"
border-strong: "#12231A"
accent: "#008751"
accent-hover: "#006B3C"
accent-active: "#005A33"
accent-tint: "#E8F5ED"
secondary: "#F4C542"
secondary-soft: "#FFF1A8"
tertiary: "#2563A6"
quaternary: "#6D3A8A"
success: "#0E7C66"
warning: "#B54708"
danger: "#B42318"
```

### Dark mode

```yaml
background: "#0B1510"
foreground: "#F4FBF6"
surface: "#122019"
surface-muted: "#182A20"
muted: "#22362A"
muted-foreground: "#A7B9AE"
border: "#385142"
border-strong: "#D8E9DE"
accent: "#43CF88"
accent-hover: "#69DDA0"
accent-active: "#8DE9B9"
accent-tint: "#153B29"
secondary: "#F4C542"
secondary-soft: "#564719"
tertiary: "#78AEEF"
quaternary: "#C18CE0"
success: "#51C6AA"
warning: "#F1A05B"
danger: "#FF8176"
```

Color never carries meaning alone. Most screen area stays neutral; green leads identity and actions while yellow, blue and purple are deliberate accents.

## Typography

- Display and headings: `Outfit Variable`, 700–800.
- Body, controls and tables: `Plus Jakarta Sans Variable`, 400–700.
- Fallback: `Noto Sans`, system UI, sans-serif.
- Headings use tight tracking and compact line height without forced uppercase.
- Body text stays between 15–18px with readable line length.
- Numeric dashboard values use tabular numerals.
- Do not turn whole screens into uppercase text.

## Geometry and depth

```yaml
radius-sm: 8px
radius-md: 14px
radius-lg: 22px
radius-full: 9999px
border-default: 2px
shadow-pop: "4px 4px 0 #12231A"
shadow-pop-hover: "6px 6px 0 #12231A"
shadow-soft: "6px 6px 0 #DDE8E1"
```

- Use fully rounded shapes for chips, avatars and primary mobile navigation.
- Cards use 14–22px radii and two-pixel boundaries.
- Featured cards may use an asymmetric speech-bubble corner or yellow/green offset shadow.
- Hard shadows have no blur. Operational rows usually need no shadow.

## Texture and decoration

- Dot grids, checker fragments, short squiggles, rings, half circles and rounded squares form the vocabulary.
- Shapes stay behind content and never receive pointer input.
- Hide decoration on small screens when it crowds content.
- Task maps use real geography. Abstract map forms must be clearly decorative.
- Avoid flags, coats of arms, political symbolism, gradients, glassmorphism, neon, glossy mascots and AI-brain imagery.

## Iconography and SVG

- Vuesax/Iconsax is the primary icon language.
- Routine icons are 20–22px `Linear`; selected navigation may use `Bold`.
- Enclose important icons in geometric backgrounds.
- Custom SVG is preferred for the mark, map pins, workflows, empty states, charts and route lines.
- Icon-only controls require names and tooltips. Decorative SVG is hidden from assistive technology.

## Components

### Buttons

- Primary: green fill, two-pixel foreground border, full radius and hard foreground shadow.
- Hover moves up/left 2px and extends the shadow; active moves down/right and reduces it.
- Secondary: surface or transparent fill, foreground border and yellow-tint hover.
- Minimum height is 48px on touch surfaces and 44px elsewhere.

### Inputs and filters

- Surface background, two-pixel border, 12–14px radius.
- Controls remain compact at 44–48px; narrow viewports do not make them huge.
- Focus uses an accent border and hard accent/focus-yellow shadow.
- Long filter groups become chips plus an accessible mobile filter sheet.

### Sticker cards

- Surface background, two-pixel border, 16–22px radius and a pale hard shadow.
- Hover may rotate at most one degree and scale at most 1.01.
- Evidence and operational queues remain still.

### Official/community pair

- Official status uses blue/neutral treatment and a building icon.
- Community verification uses purple treatment and a people/check icon.
- `Official status · RESOLVED` may coexist with `Community verification · DISPUTED`.

### Incident cards

Show reference, category, title, summary, safe location, both statuses, assigned verified organizations, report/affected/comment counts, latest update and age. Actions have a separate footer. Do not wrap independent actions in one giant link.

### Tables and maps

- Government and admin use tables where comparison matters.
- Maps use subdued land/water colors and shape/icon labels alongside color.
- Every operational map has a table/list alternative.
- Exact coordinates appear only to authorized operational users.

## Responsive shells

### Public and citizen desktop

- Sticky compact public header and 1200px public container.
- Citizen layout: 220–250px context rail, 680–760px feed, optional 280–320px rail.
- Filters use a compact toolbar and removable chips.

### Citizen mobile

- Use a floating capsule navigation inset from the screen and safe area.
- Destinations: Feed, Map, Report, Activity, Profile.
- Report rises from the bar in a bordered green circle with a hard shadow.
- Selected items use bold icons, labels and a tinted geometric background.
- Navigation never covers content or actions.

### Government, NGO and admin

- Desktop uses a collapsible 240–280px sidebar and compact top toolbar.
- Government begins with urgent queues and assignments, then map and charts.
- NGO begins with relevant issues, proposals, approvals and milestones.
- Admin begins with reviews, moderation, routing, failures and audit context.
- Mobile uses the same floating shell with role-specific destinations; tables become deliberate list rows or accessible horizontal regions.

## Screen direction

### Landing

Lead with a concrete public-service statement and `Report a problem`. Follow with real incidents, the accountability route, outcomes, organization participation and privacy. Use bold Outfit typography and geometric product-native art rather than stock photography.

### Feed

Use compact segmented tabs for For You, Nearby and Following. Show category chips and one `Filters` control; secondary status, area and organization filters live in an accessible sheet/popover. Cards should feel like civic records, not oversized marketing tiles.

### Incident detail

Above the fold: title, safe location, official/community states, assigned organizations, evidence/report count and civic actions. The timeline is the dominant narrative below.

### Authentication

Desktop uses a split layout: concise trust copy or geometric art beside a focused form card. Mobile uses one clean form. Provide password visibility, recovery, duplicate-email feedback and preserved values.

### Reporting and onboarding

Use a visible stepper, one coherent task per step, compact fields, save status, back/continue controls and a final review screen. Uploads show purpose, privacy, progress, remove and retry.

## Motion

- Controls use `cubic-bezier(.34,1.56,.64,1)` over 220–300ms.
- Marketing entrances pop or slide; decorative icons may wiggle on hover.
- Landing routes may draw on scroll and short marquees may explain the civic loop.
- Product workflows use restrained opacity and transform.
- No scroll-jacking, bouncing evidence, resolution confetti or competing motion.
- Reduced-motion disables Lenis, parallax, canvas animation, marquee, bounce and wiggle.

## Accessibility contract

- WCAG 2.2 AA; 4.5:1 normal text and 3:1 large/non-text interface contrast.
- Minimum 44px targets, with 48px preferred on mobile.
- Semantic headings, landmarks, labels and live status/error announcements.
- Visible focus, no traps, and preserved form values.
- Support 200% zoom and at least 30% text expansion.
- Provide captions, alt text and non-map alternatives.
- Render comments, mentions and AI output as untrusted plain text.

## Final design test

Inspect every route at 390px, 768px, 1280px and 1440px in light and dark modes. Verify filter density, safe-area navigation, keyboard focus, reduced motion, loading/empty/error states, long text and every active control. A screen fails if it resembles stacked desktop inputs, generic admin scaffolding, an ungrounded marketing template or a decorative map without a usable alternative.
