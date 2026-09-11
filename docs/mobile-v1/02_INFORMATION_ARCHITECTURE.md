# Neo AVO Mobile v1 — Information Architecture

## Primary Navigation
1. Overview
2. Projects
3. Incidents
4. Infra

Secondary: Activity, Agents, Intelligence, Settings, Search.

## Overview
Answers: “What needs my attention now?”
Contains global state, attention, infrastructure summary, recent important activity.

## Projects
Answers: “How is each project doing?”
Shows availability, operational health, business health, last activity, and next expected execution where applicable.

## Project Detail
Project command center: three health dimensions, attention, expected execution, dependencies, timeline, bounded commands, repository summary.

## Incidents
Tabs: Active · Resolved · All.

## Incident Detail
Decision screen: severity/status, what happened, business impact, machine evidence, AI assessment, recommended checks, repository context, recovery, timeline, contextual actions.

## Infrastructure
Host/resource state, freshness, history, services, pressure episodes, blast radius, incident links.

## Secondary Destinations
Activity = cross-project timeline. Intelligence = AI analyst activity. Agents = operational agent inventory. Search = project/incident/activity/repo navigation.

## Deep Links
Notifications should open the relevant incident/project directly.

## Back Navigation
Preserve originating filter/tab/time-range where practical.

## Critical Actions
Must remain visible; do not hide critical actions exclusively behind gestures.
