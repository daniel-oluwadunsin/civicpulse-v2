# CivicPulse Brand Guide

## Brand premise

CivicPulse turns resident evidence into a traceable public record and keeps responsibility, official action, and community verification visible. The product loop is **report → understand → locate → route → act → verify**.

Brand promise: **Move public problems forward.**

The voice is plain, assured, warm, and specific. It should feel civic without looking bureaucratic, and energetic without treating serious infrastructure problems as entertainment.

## Visual idea

The identity uses a stable civic grid with controlled geometric interruptions. Rounded blocks, route dots, circles, and directional fragments represent many public signals becoming one legible path to action. The artwork is deliberately code-native and abstract: no generic ECG line, map-pin logo, national emblem imitation, political symbolism, or invented agency branding.

The compact mark is an open Civic Green `C` built from one geometric block with a Civic Gold signal dot. The wordmark uses Outfit and highlights “Pulse” in green. This mark is authored once in the shared application shell; page components must not redraw it.

## Palette

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| Civic Green | `#008751` | `#43CF88` | identity, primary action, verified progress |
| Civic Gold | `#F4C542` | `#F4C542` | focus, attention, small geometric accents |
| Ink | `#12231A` | `#F4FBF6` | text, key borders, hard-shadow anchors |
| Warm Page | `#FFFDF5` | `#0B1510` | page background |
| Canvas | `#FFFFFF` | `#122019` | cards, forms, navigation |
| Official Blue | `#2563A6` | `#6FA8E2` | official-state semantics only |
| Community Purple | `#6D3A8A` | `#C198D7` | community-state semantics only |

Green communicates CivicPulse identity and verified forward movement; it does not mean every item is resolved. Gold is a focus and attention color, not a warning substitute. Danger, warning, official, and community states retain independent semantic colors.

## Typography

- Display and interface headings: **Outfit Variable**, usually 650–800 with tight tracking.
- Body and controls: **Plus Jakarta Sans Variable**, 400–750.
- Fallbacks: Noto Sans and the system sans-serif stack.
- Sentence case is the default. Short kickers and metadata may use uppercase with restrained tracking.

## Geometry and depth

- Build layouts on a dependable grid, then add at most one or two playful geometric interruptions per composition.
- Cards use purposeful silhouettes: `18–26px` for prominent product cards, `6–12px` for compact controls, and one cut or tight corner where useful.
- Primary actions are pill-shaped and use a crisp hard shadow. Routine operational controls stay flatter.
- Shadows are solid offsets, not diffuse glass effects.
- Avoid decorative gradients, glassmorphism, excessive floating shapes, or a different card treatment for every feature.

## Icons and illustration

Iconsax/Vuesax is the primary interface family, normalized through the shared `Icon` wrapper. Linear icons support routine actions; Bold icons identify active navigation. Every icon-only control requires an accessible name.

The current product artwork is code-native:

- the landing hero combines CSS geometry with an inline privacy-safe infrastructure illustration;
- [`nigeria-grid.svg`](../apps/web/public/brand/nigeria-grid.svg) explains the accountability route and is not an operational boundary map;
- [`civicpulse-mark.svg`](../apps/web/public/brand/civicpulse-mark.svg), [`civicpulse-logo.svg`](../apps/web/public/brand/civicpulse-logo.svg), and the inverse/stacked variants are the canonical exported identity assets;
- [`civicpulse-og-card.svg`](../apps/web/public/brand/civicpulse-og-card.svg) is the canonical social composition; its PNG and the installable app icons are deterministic browser renders of the checked-in SVG sources;
- production dashboard maps must be generated from versioned PostGIS geometry and include a list/table alternative.

Raster imagery is optional, secondary, and never used to fabricate incidents or metrics. The experimental cartography renders under `apps/web/public/brand` are not approved product assets and are not referenced by the application.

## Motion

- Motion handles route and component transitions.
- GSAP ScrollTrigger handles the landing route drawing and restrained parallax.
- Lenis is limited to the landing page and remains synchronized with ScrollTrigger.
- Authenticated workflows use short, functional transitions rather than showcase animation.
- Under `prefers-reduced-motion`, smooth scrolling, particles, pinned scenes, parallax, and non-essential transforms are disabled.

## Product language

Prefer “Report a problem,” “Confirm location,” “Official status,” “Community verification,” “Assigned organizations,” “Express interest,” and “Propose intervention.” Never say that AI knows who is responsible, that a fix is guaranteed, or that an NGO can claim a public asset.

## Research and provenance

The September 2026 refresh reviewed contemporary bottom-navigation, civic dashboard, and playful geometric identity patterns. The resulting system uses the durable parts of those references—five labelled mobile destinations, an elevated central report action, stable whitespace, modular dashboards, and restrained geometric personality—without copying a specific interface or brand.

The landing and product artwork currently shipped is SVG/CSS authored in the repository. No generated photographic or 3D asset is part of the active interface, so there is no external-image provenance to disclose for the current design.
