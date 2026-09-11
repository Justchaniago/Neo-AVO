# Neo AVO Mobile v1 — Responsive Architecture

## Goal
Device-specific composition without duplicating domain logic.

## Shared
API clients, domain types, health calculations, hooks, formatting, status semantics, design tokens, small primitives.

## Dedicated
Desktop shell/composition/inspector/sidebar and mobile shell/composition/full-screen detail/bottom navigation/action sheets.

## Avoid JS Width Branching
Do not base the architecture on repeated `window.innerWidth`. Prefer CSS/media-query layout boundaries. Use JS only when behavior truly differs.

## Breakpoints
Reuse the project’s existing breakpoint system after inspecting styles. Do not invent arbitrary breakpoints.

## Hydration
Avoid server/client mismatch from viewport-dependent markup.

## Example
```text
shared/ StatusBadge HealthIndicator Metric Time Severity
desktop/ DashboardDesktop ProjectDesktop IncidentInspectorDesktop
mobile/ DashboardMobile ProjectMobile IncidentMobile MobileBottomNav MobileActionSheet
```

## Rule
Business rules are never duplicated between mobile and desktop.
