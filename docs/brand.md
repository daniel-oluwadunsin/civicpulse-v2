# CivicPulse Brand Guide

## Brand premise

CivicPulse makes public problems legible and actionable. It turns a resident’s evidence into a traceable civic record, routes that record to the organizations whose verified mandates apply, and keeps the response visible until the community can confirm or challenge the outcome.

Brand promise: **Make the signal impossible to ignore.**

Useful product line: **REPORT. ROUTE. RESOLVE.**

The voice is direct, calm, specific, and public-minded. It should feel like a well-run civic service or transit map: confident because the system is clear, not because the language is loud.

## Visual idea

The identity combines a civic grid with a pulse route. The black square represents the built public system; the red line is a report moving through evidence, jurisdiction, responsibility, and action. The mark is deliberately geometric so it works as an app icon, status signal, map marker, and organization-facing product signature.

The visual language is Swiss International Style as defined in [`docs/design.md`](design.md): visible structure, asymmetry, active negative space, objective typography, and red used as a functional signal.

## Core palette

| Token  | Hex       | Use                                                  |
| ------ | --------- | ---------------------------------------------------- |
| Canvas | `#FFFFFF` | page canvas, cards, breathing room                   |
| Ink    | `#000000` | type, borders, primary controls, structural blocks   |
| Field  | `#F2F2F2` | secondary surfaces, section rhythm, pattern fields   |
| Signal | `#FF3000` | CTAs, warnings, section numbers, active route, focus |

Do not introduce extra brand colors. Photographic imagery may retain restrained natural tones, but UI surfaces and controls remain in the strict palette.

## Typography

- Primary family: Inter.
- Headings: 700–900, generally uppercase, tight tracking, flush-left.
- Body: 400–500, normal sentence case for readability.
- Labels and metadata: 600–800, uppercase, wide tracking.
- Let scale establish hierarchy. Avoid decorative serif display type and avoid rounded “friendly” UI typography.

## Geometry and texture

- Radius: `0px`.
- Borders: visible black structure, typically 2px or 4px for major divisions.
- Depth: grid, dot, diagonal, and restrained noise patterns; never drop shadows or glossy gradients.
- Layout: asymmetric 8:4, 7:5, or 5:7 relationships where content benefits from tension and clear hierarchy.
- Motion: fast, mechanical, and purposeful; always respect `prefers-reduced-motion`.

## Mark usage

Primary assets:

- [`civicpulse-logo.svg`](../apps/web/public/brand/civicpulse-logo.svg) — full horizontal lockup for navigation and marketing surfaces.
- [`civicpulse-mark.svg`](../apps/web/public/brand/civicpulse-mark.svg) — standalone mark for compact UI, avatars, map legends, and app launch surfaces.
- [`civicpulse-mark-inverse.svg`](../apps/web/public/brand/civicpulse-mark-inverse.svg) — mark for black surfaces.
- [`civicpulse-wordmark.svg`](../apps/web/public/brand/civicpulse-wordmark.svg) — stacked wordmark for narrow layouts or editorial compositions.
- [`civicpulse-wordmark-inverse.svg`](../apps/web/public/brand/civicpulse-wordmark-inverse.svg) — reversed stacked wordmark.
- [`favicon.svg`](../apps/web/public/icons/favicon.svg) — canonical browser favicon; keep it at native viewBox proportions.
- [`favicon-16x16.png`](../apps/web/public/icons/favicon-16x16.png) and [`favicon-32x32.png`](../apps/web/public/icons/favicon-32x32.png) — legacy browser favicon sizes.
- [`apple-touch-icon.png`](../apps/web/public/icons/apple-touch-icon.png) — 180px iOS home-screen icon.
- [`icon-192.png`](../apps/web/public/icons/icon-192.png) and [`icon-512.png`](../apps/web/public/icons/icon-512.png) — installable-app icon sizes referenced by `site.webmanifest`.
- [`civicpulse-og-card.svg`](../apps/web/public/brand/civicpulse-og-card.svg) and [`civicpulse-og-card.png`](../apps/web/public/brand/civicpulse-og-card.png) — canonical vector and raster social/share card compositions.

Clear space: preserve at least one pulse-grid unit around the mark. Do not add drop shadows, outlines, gradients, bevels, extra symbols, or alternate colors. Never stretch the lockup or place the red signal on a red field.

## Photography and illustration

Use visuals that show public infrastructure, evidence, maps, field conditions, and useful civic action. Keep people anonymous unless the product explicitly requires a consented portrait. Avoid disaster voyeurism, poverty stereotypes, political symbolism, campaign imagery, and invented official signage.

Generated project assets:

- [`civicpulse-hero.png`](../apps/web/public/brand/civicpulse-hero.png) — wide landing-page composition with infrastructure grid and negative space for copy.
- [`civicpulse-evidence-drainage.png`](../apps/web/public/brand/civicpulse-evidence-drainage.png) — documentary drainage detail for issue context, evidence, or “how it works” sections.

Both assets were generated with the built-in ImageGen workflow and saved into the project after visual review. They contain no intentional text, logo, watermark, or political symbol.

## Recommended UI language

Prefer:

- “Report a problem”
- “Confirm location”
- “Processing your report”
- “Assigned organizations”
- “Official status”
- “Community verification”
- “Add evidence”
- “Dispute resolution”

Avoid vague or overpromising language such as “AI knows who is responsible,” “guaranteed fix,” “instant resolution,” or a single opaque performance score.

## Asset generation prompts

Hero prompt summary: Swiss International Style editorial illustration of a Nigerian civic-infrastructure network, abstract road/drainage/bridge/map grid, one sparse `#FF3000` route, right-weighted composition with left negative space, no text, no logo, no watermark, no gradients, no stereotypical imagery.

Evidence prompt summary: respectful documentary photograph of a Nigerian urban drainage channel beside a wet road after light rain, visible but non-sensational blockage, natural overcast light, no identifiable people, no text, no logos, no watermark.
