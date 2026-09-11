# Neo AVO Mobile v1 — Master Plan

## Mission
Build a mobile-native presentation and interaction layer for Neo AVO while preserving the existing desktop experience as a protected baseline.

Mobile is not a shrunken desktop dashboard. It is an operational command center optimized for fast situational awareness, incident understanding, investigation, bounded action, and recovery verification.

Core model: **Observe → Understand → Investigate → Act → Verify**.

## Goals
1. Purpose-built mobile UX with no horizontal overflow, hover dependencies, or desktop-layout compromises.
2. Preserve desktop visual DNA: palette, typography, borders, badges, buttons, status semantics, spacing character, iconography.
3. Shared domain/API/data hooks/design tokens; separate mobile and desktop composition.
4. Correct CPU/load semantics, telemetry freshness, global health aggregation, and desktop infrastructure card density/status.
5. Protect desktop from incidental redesign.
6. Deploy only after mobile and desktop acceptance pass.

## Non-Goals
- No second Neo AVO application.
- No native iOS/Android codebase.
- No duplicate backend/domain logic.
- No separate mobile APIs.
- No arbitrary desktop redesign.
- No new monitoring infrastructure.
- No business-logic changes in monitored projects.

## Architecture
Use shared domain/data/primitives with separate presentation composition:
```text
app/
├── ui/shared/
├── ui/desktop/
├── ui/mobile/
├── domain/
├── data/
└── api/
```
Do not duplicate business rules between mobile and desktop.

## Desktop Protection
Permitted desktop changes only:
1. CPU/load semantic correction.
2. Telemetry freshness/stale semantics.
3. Global health aggregation correction.
4. Infrastructure overview card density/status correction.
Everything else is protected.

## Primary Mobile Navigation
Bottom navigation: Overview · Projects · Incidents · Infra.
Secondary: Activity · Agents · Intelligence · Settings · Search.

## Execution Sequence
0. Reconnaissance
1. Semantic corrections
2. Shared presentation architecture
3. Mobile shell/navigation
4. Overview + Projects
5. Incident workflow
6. Infrastructure
7. Secondary screens
8. Loading/error/stale/offline states
9. Responsive + desktop regression
10. Build + deploy
11. Production acceptance

## Definition of Done
- Mobile navigation stable and intuitive.
- Mobile screens are purpose-built, not stacked desktop layouts.
- Incident flow is one-hand usable.
- No horizontal overflow at target phone widths.
- Correct touch targets.
- Correct stale/offline semantics.
- Desktop protected surfaces intact.
- CPU/load and health semantics correct.
- Build/deploy pass.
- Zero project business mutations during acceptance.

## Agent Rules
Read existing implementation before changing it. Verify schema/type/API before using fields. Trace producer → persistence → API → UI before changing semantics. Never invent missing backend capability to satisfy UI.
