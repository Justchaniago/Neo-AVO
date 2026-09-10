# NEO AVO --- FINAL UI/UX IMPLEMENTATION SPECIFICATION

**Status:** DESIGN FROZEN --- implementation-ready\
**Target implementer:** Codex / primary engineering agent\
**Product:** Neo AVO --- Autonomous Virtual Office\
**Design direction:** Neo-Brutalist Autonomous Operations Console\
**Purpose:** Single source of truth for the Neo AVO web UI redesign.

------------------------------------------------------------------------

# 0. IMPLEMENTATION DIRECTIVE

This document supersedes earlier UI exploration documents where they
conflict.

The implementation must combine:

-   the **product architecture and operational truth** of Neo AVO;
-   the strongest UX decisions from the Claude UI/UX proposal;
-   the **higher visual intensity and stronger art direction** of the
    approved AVO dashboard reference;
-   the tactile component language of the Neo-Brutalism component
    reference.

This is not another design exploration.

**Implement the redesign against the existing Neo AVO application and
real backend capabilities.**

Before changing code:

1.  inspect the current repository and existing routes/components/data
    contracts;
2.  map real backend capability to the surfaces defined here;
3.  preserve existing production behavior and integrations;
4.  reuse real data and existing APIs;
5.  do not invent backend capabilities merely to satisfy a mockup;
6.  do not rewrite stable backend architecture for a UI redesign;
7.  do not replace working functionality with static mock data;
8.  do not stop after only redesigning Overview --- the shell and core
    screens must form one coherent product.

If a proposed visual surface lacks real data, implement a truthful empty
state.

------------------------------------------------------------------------

# 1. PRODUCT DEFINITION

**Neo AVO = Autonomous Virtual Office.**

Neo AVO is an **observe-first autonomous operations hub** for monitoring
independent projects, services, workers, automations, and AI agents from
one control surface.

The owner should open Neo AVO and immediately understand:

1.  Are all systems operational?
2.  Does anything require attention?
3.  What happened recently?
4.  Which projects are online, stale, degraded, failing, or offline?
5.  What are connected workers/agents doing, if telemetry exists?
6.  What recovered automatically?
7.  Why did something go wrong?
8.  Is operator action required?

The intended feeling:

> **A control room you live in, not a dashboard you occasionally
> check.**

The primary silent question is:

> **Do I need to do anything right now?**

The interface should answer it within seconds.

------------------------------------------------------------------------

# 2. ARCHITECTURAL BOUNDARY

The core invariant is:

> **No connected project may depend on Neo AVO to perform its core
> function.**

Neo AVO observes independent systems.

Example:

``` text
TELE AUTO
├── Telegram input
├── validation
├── business execution
├── Google Sheets mutation
├── durable state / recovery
└── independent runtime
        │
        └── telemetry
              ↓
           NEO AVO
```

If Neo AVO is unavailable, Tele Auto continues operating.

Product philosophy:

> **Observe by default. Act only through explicit bounded controls.
> Never become the execution engine.**

The current redesign is primarily an **observe / investigate /
understand** interface.

------------------------------------------------------------------------

# 3. WHAT NEO AVO IS NOT

Neo AVO is not:

-   Jira;
-   Linear;
-   Trello;
-   a task manager;
-   a staff productivity system;
-   a raw log viewer;
-   a Grafana clone;
-   an execution engine;
-   an arbitrary shell;
-   a deployment engine;
-   a universal scheduler;
-   a generic workflow builder;
-   a generic AI chatbot;
-   a shared API/model gateway;
-   a system that directly mutates connected-project business state.

Do not introduce fake concepts such as:

-   Total Tasks;
-   Awaiting Review;
-   Staff Productivity;
-   Project 70% Complete;
-   arbitrary task progress;
-   fake agents;
-   fake project activity.

The visual reference containing those concepts is a
**composition/art-direction reference only**.

------------------------------------------------------------------------

# 4. CURRENT PRODUCT CAPABILITIES

Neo AVO already has production infrastructure and operational
capabilities including:

-   web application;
-   background worker;
-   PostgreSQL;
-   project registration;
-   authenticated event ingestion;
-   deterministic event deduplication;
-   activity projection;
-   availability projection;
-   operational health projection;
-   incident mapping;
-   Telegram operational notifier;
-   AI Ops / intelligence capability;
-   production HTTPS;
-   production backup and restore.

A real connected production project is:

**Tele Auto V2**

Real Tele Auto dimensions include:

-   PMS;
-   TP6;
-   Production;
-   Waste;
-   Daily SO;
-   clarification;
-   confirmation;
-   completion;
-   failure;
-   recovery;
-   schema mismatch;
-   execution uncertainty.

Use actual repository contracts and data rather than assumptions from
this document.

------------------------------------------------------------------------

# 5. PLATFORM SERVICE MODEL

Think of Neo AVO as:

``` text
                    PROJECT REGISTRY
                           │
PROJECTS ── EVENTS ──► EVENT INGESTION
                           │
                           ▼
                    ACTIVITY PROJECTION
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
       AVAILABILITY       HEALTH      INCIDENTS
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                    NOTIFICATIONS
                    └── TELEGRAM

Operational facts
       │
       ▼
 AI OPS / INTELLIGENCE
       │
       ▼
explanation / correlation /
investigation assistance
```

Agent/worker observability and global search span these services.

------------------------------------------------------------------------

# 6. PLATFORM SERVICES

## 6.1 Project Registry

Connected independent systems.

Useful project information:

-   project identity;
-   environment;
-   description;
-   availability;
-   operational health;
-   last seen;
-   platform/runtime where known;
-   recent activity;
-   active incidents;
-   agent/worker telemetry where available;
-   integration state.

## 6.2 Event Ingestion

Projects emit normalized operational facts.

The web UI should not become an API console.

Events feed:

-   Activity;
-   health;
-   availability;
-   incidents;
-   timelines;
-   investigation;
-   intelligence.

## 6.3 Activity Projection

Activity answers:

> **What happened?**

Examples:

``` text
DAILY SO COMPLETED
Tele Auto · PMS

PRODUCTION COMPLETED
Tele Auto · TP6

WORKER RECOVERY

SHEETS SCHEMA MISMATCH
Tele Auto · PMS · Production
```

## 6.4 Availability

Availability answers:

> **Is the project currently alive / recently observable?**

States:

-   ONLINE
-   STALE
-   OFFLINE
-   UNKNOWN

## 6.5 Operational Health

Health answers:

> **Is the project doing its job correctly?**

States:

-   HEALTHY
-   DEGRADED
-   FAILING
-   UNKNOWN

Availability and health are different dimensions.

A project may be:

``` text
ONLINE + DEGRADED
```

Never collapse them into one generic status.

## 6.6 Incidents

Incidents answer:

> **What requires attention?**

Possible meaningful incident sources include:

-   effect uncertain;
-   repeated failures;
-   schema mismatch;
-   persistent recovery failure;
-   runtime offline;
-   sustained delivery failure.

Normal clarification/confirmation is activity, not an incident.

## 6.7 Telegram Operations Notifier

Telegram is:

-   owner-facing operational notification;
-   compact read-only status access;
-   incident/recovery notification.

It is not:

-   raw log streaming;
-   the Tele Auto business bot;
-   an execution engine;
-   a replacement for the web UI.

Possible read-only commands:

``` text
/status
/recent
/incidents
```

Do not expose bot credentials in UI.

## 6.8 AI Ops Intelligence

Core rule:

> **Machines determine WHAT happened. AI helps explain WHY and what to
> consider next.**

AI can:

-   summarize state;
-   correlate facts;
-   explain incidents;
-   identify patterns/anomalies;
-   summarize time periods;
-   answer operational questions;
-   suggest investigation paths.

AI must never visually masquerade as deterministic machine truth.

## 6.9 Agent / Worker Observability

Agents may include:

-   autonomous coding agents;
-   AI operational agents;
-   workers;
-   automations;
-   scheduled autonomous processes.

Only display telemetry that actually exists.

Potential fields, when supported:

-   identity;
-   type;
-   state;
-   associated project;
-   current activity;
-   heartbeat;
-   runtime/session;
-   recent actions;
-   failures;
-   model/provider;
-   token/cost information.

## 6.10 Global Search / Investigation

Search can target:

-   project;
-   run ID;
-   incident ID;
-   event;
-   agent;
-   context/store;
-   error code;
-   activity.

Recommended operator interaction:

``` text
⌘ K
SEARCH ANYTHING_
```

## 6.11 Bounded Commands --- Future

Bounded project actions are an architectural future capability.

Do not create an arbitrary terminal or generic Run/Restart/Deploy
buttons.

Only expose actions that the current backend actually supports.

------------------------------------------------------------------------

# 7. FINAL DESIGN THESIS

> **Brutalist hardware aesthetics with the information discipline of an
> operations cockpit.**

Neo AVO should feel like:

-   a physical mission-control panel rendered in software;
-   distinctive;
-   tactile;
-   playful;
-   dense where useful;
-   technically serious;
-   immediately understandable.

However, the earlier restrained design exploration was visually too
close to a normal SaaS dashboard.

The final direction deliberately **raises visual expression**.

The final design combines:

### From the approved AVO dashboard reference

-   black structural shell;
-   strong AVO brand block;
-   segmented top control bar;
-   oversized editorial page titles;
-   high information density;
-   chunky control blocks;
-   heavy visible outlines;
-   strong hard shadows;
-   larger semantic-color surfaces;
-   physical control-panel character.

### From the Neo-Brutalism component reference

-   warm canvas;
-   small/medium rounded corners;
-   tactile buttons;
-   bento composition;
-   hard offset shadows;
-   saturated pastel accents;
-   tabs/toggles/inputs/dropdowns/chips with physical behavior.

### From Claude's proposal

-   operational information hierarchy;
-   progressive disclosure;
-   side inspectors;
-   availability ≠ health;
-   AI ≠ machine truth;
-   semantic colors;
-   real-data rule;
-   responsive triage;
-   coherent component system.

------------------------------------------------------------------------

# 8. VISUAL INTENSITY --- IMPORTANT CORRECTION

Do **not** interpret "semantic color" as "almost everything must be
white."

Semantic color may occupy a **large surface** when that entire surface
has that meaning.

Examples:

-   a global healthy status block may use lime prominently;
-   a critical attention surface may use coral;
-   Intelligence may own a purple visual territory;
-   warning/degraded surfaces may use orange.

Rule:

> **Color can be structural when the entire region carries the
> corresponding semantic meaning.**

Avoid random rainbow cards, but do not neuter the art direction.

------------------------------------------------------------------------

# 9. FINAL PRODUCT SHELL

## 9.1 Desktop Structure

Use:

``` text
BLACK SIDEBAR + SEGMENTED TOP CONTROL BAR + WARM MAIN CANVAS
```

The shell should feel like a control console, not a generic admin
template.

## 9.2 Sidebar

**Final decision: black sidebar.**

Do not use the previous cream SaaS sidebar with headings such as:

-   Operate
-   Understand
-   Configure

Keep navigation simpler and more iconic.

Recommended:

``` text
┌─────────────────────┐
│ AVO.                │
│ AUTONOMOUS          │
│ VIRTUAL OFFICE      │
├─────────────────────┤
│ █ OVERVIEW          │
│   PROJECTS          │
│   ACTIVITY          │
│   INCIDENTS         │
│                     │
│   AGENTS            │
│   INTELLIGENCE      │
│                     │
│   SETTINGS          │
│                     │
│                     │
│ SYSTEM PULSE        │
│ ● ONLINE            │
│ NEO AVO             │
└─────────────────────┘
```

Properties:

-   near-black background;
-   white/off-white nav text;
-   active nav uses a large lime rectangular block with black text;
-   simple bold geometric icons;
-   brand area is visually strong;
-   bottom system pulse is persistent;
-   optional version/environment information can live at the bottom if
    real.

The sidebar itself is part of the brand.

## 9.3 Brand Block

Top-left identity should be stronger than a small "Neo AVO" text label.

Preferred:

``` text
AVO.
AUTONOMOUS
VIRTUAL OFFICE
```

`AVO.` should be oversized/bold.

Lime is appropriate for the brand block.

## 9.4 Top Control Bar

The top bar should be segmented into physical control blocks.

Concept:

``` text
┌────┬──────────────────────────┬──────────────────────┬──────────────┐
│ ☰  │ SEARCH ANYTHING...       │ ■ SYSTEM STATUS      │ OWNER        │
│    │ ⌘K                       │ ALL OPERATIONAL      │ SYSTEM OWNER │
└────┴──────────────────────────┴──────────────────────┴──────────────┘
```

Recommended behavior:

-   menu/sidebar control;
-   global search / command palette;
-   persistent global status;
-   owner/profile area;
-   environment indicator only if real/useful.

Global status is high-value and should remain visible.

Do not clutter the top bar with speculative controls.

------------------------------------------------------------------------

# 10. PAGE TITLE LANGUAGE

Use oversized editorial typography to give each top-level surface
identity.

Examples:

``` text
OVERVIEW
REAL-TIME STATE OF YOUR AUTONOMOUS OFFICE
```

``` text
PROJECTS
CONNECTED SYSTEMS & SERVICES
```

``` text
ACTIVITY
WHAT HAPPENED ACROSS YOUR AUTONOMOUS OFFICE
```

``` text
ATTENTION
OPERATIONAL EVENTS REQUIRING YOUR ATTENTION
```

``` text
AGENTS
AUTONOMOUS WORKERS REPORTING TO NEO AVO
```

``` text
INTELLIGENCE
AI-ASSISTED OPERATIONAL ANALYSIS
```

Large page titles are part of the visual identity.

Use uppercase for **major editorial display headings and compact
operational labels where visually appropriate**.

Do not make long body text uppercase.

------------------------------------------------------------------------

# 11. COLOR SYSTEM

Initial palette:

``` text
canvas.base       #F6F1E7
canvas.raised     #FFFFFF

ink.black         #111111
ink.secondary     #4A4744
ink.muted         #B7B2A8

lime              #C8F169
cyan              #7FE3E0
purple            #C6B6F5
orange            #FFB74D
coral             #FF6B6B
```

Semantic meaning:

  Color                Meaning
  -------------------- ----------------------------------------------
  Lime / acid yellow   primary, active, healthy, system operational
  Cyan / teal          system information / secondary
  Purple               AI, Intelligence, Agents
  Orange               warning, stale, degraded
  Coral / red          critical, failing, incident
  Warm off-white       application canvas
  White                raised operational surface
  Black                structural shell, borders, typography
  Gray                 inactive, unknown, secondary

Do not randomly color each card.

------------------------------------------------------------------------

# 12. TYPOGRAPHY

Use three roles.

## 12.1 Editorial Display

Bold, confident, somewhat condensed grotesk.

For:

-   AVO.;
-   OVERVIEW;
-   PROJECTS;
-   ATTENTION;
-   INTELLIGENCE;
-   hero operational statements.

Page titles should be significantly larger than in the first Claude
prototype.

## 12.2 UI / Body

Readable sans-serif for:

-   descriptions;
-   navigation;
-   settings;
-   incident explanation;
-   AI analysis.

## 12.3 Machine / Operational Data

Monospace for:

``` text
04:28:31 WIB
run_83f28
812ms
ONLINE
SHEET_SCHEMA_MISMATCH
```

Do not make the entire UI monospace.

Suggested scale:

``` text
meta        12px
label       13px
body        16px
subhead     20px
section     25px
title       40–56px desktop
hero        48–64px when appropriate
```

Exact responsive sizing can be tuned during implementation.

------------------------------------------------------------------------

# 13. BORDER, RADIUS, SHADOW

## Borders

-   primary structural border: `2px solid #111`;
-   especially important control blocks may use `3px` if visually
    needed;
-   nested secondary borders: `1px`.

## Radius

Neo-Brutalist, not raw Brutalist:

``` text
container   8px
control     6px
status pill 999px only where semantically appropriate
```

Do not use giant SaaS radii.

## Hard Shadows

No blurred card shadows.

``` text
shadow.sm   2px 2px 0 #111
shadow.md   4px 4px 0 #111
shadow.lg   6px 6px 0 #111
```

Use stronger shadows than the first Claude prototype.

Shadow depth communicates hierarchy.

------------------------------------------------------------------------

# 14. COMPONENT INTERACTION

Physical controls should feel tactile.

## Rest

Full hard shadow.

## Hover

Slight lift / shadow increase or position shift.

## Pressed

Element translates toward the shadow and shadow collapses.

Example concept:

``` text
REST
shadow 4px 4px

HOVER
translate(-1px,-1px)
shadow 5–6px

PRESS
translate(3px,3px)
shadow 1px
```

Use this primarily for controls:

-   buttons;
-   tabs;
-   toggles;
-   icon buttons.

Do not make every data card bounce on hover.

------------------------------------------------------------------------

# 15. COMPONENT LIBRARY

Create/reuse a coherent system for:

-   Button;
-   IconButton;
-   Card;
-   BentoCard;
-   BrandBlock;
-   NavItem;
-   TopBarSegment;
-   StatusBadge;
-   AvailabilityIndicator;
-   HealthBadge;
-   SeverityBadge;
-   Tag;
-   Toggle;
-   Checkbox;
-   Tabs;
-   SearchInput;
-   Select;
-   Dropdown;
-   Tooltip;
-   Metric;
-   ProjectCard;
-   ProjectRow;
-   ActivityRow;
-   IncidentCard;
-   AgentCard;
-   IntelligenceCard;
-   EmptyState;
-   ErrorState;
-   Skeleton;
-   Drawer / Inspector;
-   Modal;
-   CommandPalette;
-   Toast.

Do not create unrelated styling independently on each page.

------------------------------------------------------------------------

# 16. AVAILABILITY VS HEALTH --- FROZEN VISUAL GRAMMAR

This distinction is mandatory.

## Availability

Use a **small dot/ring + text**.

``` text
● ONLINE
○ STALE
● OFFLINE
? UNKNOWN
```

Meaning: reachable/reporting/recently observable.

## Operational Health

Use a **larger rectangular/pill badge**.

``` text
[ HEALTHY ]
[ DEGRADED ]
[ FAILING ]
[ UNKNOWN ]
```

Meaning: doing its job correctly.

Example:

``` text
● ONLINE          [ HEALTHY ]
● ONLINE          [ DEGRADED ]
○ STALE           [ HEALTHY ]
● OFFLINE         [ FAILING ]
```

Shape + position + text must distinguish them, not color alone.

------------------------------------------------------------------------

# 17. BENTO SYSTEM

Bento is a primary composition technique.

But size must encode importance.

Never create a wall of equal KPI cards.

Example:

``` text
┌──────────────────────────────┬─────────────────────────┐
│ SYSTEM STATUS                │ ATTENTION               │
│                              │                         │
│ ALL SYSTEMS                  │ NO CRITICAL INCIDENTS   │
│ OPERATIONAL                  │                         │
│                              │                         │
├───────────────────┬──────────┴─────────────────────────┤
│ PROJECT HEALTH    │ RECENT ACTIVITY                    │
│                   │                                    │
├───────────────────┴────────────────────────────────────┤
│ INTELLIGENCE / LATEST OBSERVATION                      │
└────────────────────────────────────────────────────────┘
```

Bento should be denser than the first Claude prototype.

Avoid large meaningless empty areas.

------------------------------------------------------------------------

# 18. OVERVIEW --- FINAL DIRECTION

Overview is the Situation Room.

It should answer within seconds:

-   overall state;
-   attention;
-   project health;
-   recent activity;
-   agent state if real;
-   AI observation if meaningful.

Priority:

1.  Global operational state
2.  Attention/incidents
3.  Project health
4.  Recent activity
5.  Agent state
6.  AI Ops observation
7.  Secondary metrics

Suggested composition:

``` text
┌────────────────────────────────────────────────────────────────────┐
│ OVERVIEW                                         04:32:18 WIB      │
│ REAL-TIME STATE OF YOUR AUTONOMOUS OFFICE                         │
│                                                                    │
│ ┌──────────────────────────┐ ┌──────────────────────────────────┐  │
│ │ SYSTEM STATUS            │ │ ATTENTION                        │  │
│ │                          │ │                                  │  │
│ │ ALL SYSTEMS              │ │ NO CRITICAL INCIDENTS            │  │
│ │ OPERATIONAL              │ │                                  │  │
│ │                          │ │                                  │  │
│ │ ● PROJECTS ONLINE        │ │                                  │  │
│ │ ■ LAST EVENT 12 SEC AGO  │ │                                  │  │
│ └──────────────────────────┘ └──────────────────────────────────┘  │
│                                                                    │
│ ┌──────────────────────┐ ┌──────────────────────────────────────┐ │
│ │ PROJECT HEALTH       │ │ RECENT ACTIVITY                      │ │
│ │                      │ │                                      │ │
│ │ TELE AUTO V2         │ │ 04:31 DAILY SO COMPLETED            │ │
│ │ ● ONLINE             │ │ 04:28 PRODUCTION COMPLETED          │ │
│ │ [ HEALTHY ]          │ │ 04:22 RECOVERY                      │ │
│ └──────────────────────┘ └──────────────────────────────────────┘ │
│                                                                    │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ INTELLIGENCE / LATEST OBSERVATION                              │ │
│ │ No operator action currently required.                        │ │
│ └────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

Use real values.

If there is only one connected project, do not invent three project
cards.

If no agents report telemetry, show a truthful compact empty state
rather than "6 agents live."

------------------------------------------------------------------------

# 19. PROJECTS

Purpose:

> **Connected systems & services.**

Project cards should show at a glance:

-   identity;
-   environment;
-   availability;
-   health;
-   last activity;
-   incident signal if relevant.

No fake completion percentage.

Example:

``` text
TA

TELE AUTO V2
OPERATIONAL DATA ENTRY

● ONLINE          [ HEALTHY ]

PRODUCTION
GCP CLOUD RUN

LAST ACTIVITY
12 SEC AGO
```

Card hierarchy can use bento sizing when meaningful, but do not
fabricate "importance" from arbitrary project order.

------------------------------------------------------------------------

# 20. PROJECT WORKSPACE

Project workspace is a project-specific operational cockpit.

Header:

``` text
TELE AUTO V2

● ONLINE          [ HEALTHY ]

PRODUCTION
GCP · ASIA-SOUTHEAST2
LAST SEEN 8 SEC AGO
```

Show only sections backed by current capability.

Potential real sections:

-   Operational Summary;
-   Activity;
-   Incidents;
-   Context;
-   Intelligence;
-   Agents/Workers if telemetry exists.

For Tele Auto, useful real filters may include:

``` text
ALL | PMS | TP6

ALL | PRODUCTION | WASTE | DAILY SO
```

Do not automatically implement speculative tabs such as project
Settings, Runs, or Agents unless current repository/backend data
actually supports them.

------------------------------------------------------------------------

# 21. ACTIVITY

Activity answers:

> **What happened?**

Use a dense operational feed.

Suggested filters, only when supported:

``` text
SEARCH_
PROJECT
SEVERITY / TYPE
ENVIRONMENT
TIME RANGE
```

Rows should prioritize:

-   timestamp;
-   project;
-   concise event/action;
-   context;
-   state/severity;
-   inspect affordance.

Activity is normalized operational history, not raw logs.

Do not implement infinite scroll purely because a design proposal
suggested it; use the repository's actual pagination/data-loading model
unless there is a clear reason to improve it safely.

------------------------------------------------------------------------

# 22. RUN / EVENT INSPECTOR

Use a right-side Inspector when possible to preserve operator context.

Example:

``` text
RUN

run_29183

TELE AUTO
PMS
DAILY SO

COMPLETED

DURATION
812ms

TIMELINE

RECEIVED
   ↓
PROCESSING
   ↓
COMPLETED

NO INCIDENT GENERATED
```

Useful actions:

-   copy ID;
-   open project;
-   open related incident;
-   inspect safe normalized metadata.

### Explicit correction from earlier proposal

**Do not add a generic raw-log section.**

Neo AVO should privilege normalized operational facts.

Raw infrastructure/application logs belong to their existing operational
logging systems unless Neo AVO gains an explicit log-management
capability later.

Never expose secrets/private raw payloads.

------------------------------------------------------------------------

# 23. INCIDENTS / ATTENTION

The top-level navigation may remain **INCIDENTS**, while the page can
use **ATTENTION** as the large editorial heading.

Activity asks:

> What happened?

Attention asks:

> What requires action or investigation?

Example:

``` text
ATTENTION

2 OPEN
14 RESOLVED

CRITICAL

TELE AUTO
EFFECT UNCERTAIN

PMS / PRODUCTION
OPENED 4 MIN AGO

Execution effect could not be confirmed.

INVESTIGATE →
```

List-first is preferred over a decorative card grid.

Sort/filter using actual backend capabilities.

Incident detail should expose:

-   incident ID;
-   severity;
-   current state;
-   project/context;
-   timestamps;
-   related events/runs;
-   recovery information;
-   AI analysis when available.

### Action rule

Do not add `Acknowledge`, `Resolve`, or similar mutation controls unless
the existing backend already supports those actions safely.

If unsupported, show read-only incident state.

------------------------------------------------------------------------

# 24. AGENTS

Agents are strategically important to the Autonomous Virtual Office
concept, but the UI must be truthful.

Potential agent card when telemetry exists:

``` text
CX

CODEX
● ACTIVE        [ HEALTHY ]

PRIMARY IMPLEMENTER
PROJECT / WEBSITE

CURRENT ACTIVITY
Refactor authentication
```

Potential states:

-   ACTIVE;
-   IDLE;
-   DEGRADED;
-   FAILED;
-   OFFLINE;
-   UNKNOWN.

If no agent telemetry exists:

``` text
NO AGENTS REPORTING

REGISTERED AGENTS AND WORKERS WILL
APPEAR HERE WHEN TELEMETRY IS AVAILABLE.
```

Do not create fake agents to fill the screen.

------------------------------------------------------------------------

# 25. INTELLIGENCE

Intelligence is an **Ops Analyst workspace**, not a giant chatbot.

Preferred structure:

``` text
INTELLIGENCE
AI-ASSISTED OPERATIONAL ANALYSIS

SYSTEM ASSESSMENT
04:12 WIB

OPERATIONS STABLE.

2 TRANSIENT FAILURES DETECTED.
BOTH RECOVERED AUTOMATICALLY.

NO OPERATOR ACTION REQUIRED.

────────────────────────

01 / OBSERVATION
...

02 / OBSERVATION
...

────────────────────────

ASK NEO_
```

Potential areas:

-   current operational brief;
-   observations;
-   anomalies;
-   correlations;
-   incident analysis;
-   recent analyses;
-   follow-up query.

------------------------------------------------------------------------

# 26. MACHINE TRUTH VS AI INTERPRETATION

Machine truth gets stronger structural weight.

Example:

``` text
TELE AUTO
● ONLINE
[ DEGRADED ]
```

AI interpretation must be explicitly labeled:

``` text
ANALYSIS

Repeated delivery latency appears correlated
with ...
```

AI surfaces use purple semantic treatment.

Unlike the earlier Claude proposal, purple may be more visually
expressive than only a thin border, but it must remain clear that it
represents **interpretation**, not deterministic state.

Never let an AI statement look like a system status badge.

------------------------------------------------------------------------

# 27. SETTINGS

Settings is intentionally calmer than Overview.

Recommended subsections:

-   Projects;
-   Notifications;
-   Integrations;
-   System.

Use a scan-friendly list/form layout rather than forcing every setting
into bento cards.

## Notifications

Example:

``` text
TELEGRAM OPS

CONNECTED
NEO AVO OPS BOT

NOTIFY

[x] CRITICAL INCIDENTS
[x] PROJECT OFFLINE
[x] HEALTH DEGRADATION
[x] RECOVERY
[x] REPEATED FAILURES
[ ] NORMAL OPERATIONS
```

Only expose settings actually supported by the current system.

Never expose secret values.

## System

Where data exists:

-   web health;
-   worker health;
-   database health;
-   environment;
-   version;
-   backup state / last backup.

------------------------------------------------------------------------

# 28. GLOBAL SEARCH / COMMAND PALETTE

Use:

``` text
⌘ K
SEARCH ANYTHING_
```

Potential searchable objects:

``` text
PROJECT
TELE AUTO V2

RUN
run_29183

INCIDENT
INC-2031

CONTEXT
PMS

ERROR
SHEET_SCHEMA_MISMATCH
```

This is an operator navigation/investigation tool.

Do not add speculative destructive commands.

------------------------------------------------------------------------

# 29. SIDE INSPECTOR

The Inspector is a core UX pattern.

Use it for:

-   activity;
-   event/run;
-   incident reference;
-   agent;
-   project reference where appropriate.

Goal:

> inspect without losing the surrounding operational context.

Desktop: right-side drawer/pane.\
Tablet/mobile: full-height overlay or dedicated detail surface.

------------------------------------------------------------------------

# 30. REAL-TIME EXPERIENCE

Neo AVO should feel live but calm.

Useful transitions:

``` text
ONLINE → STALE
HEALTHY → DEGRADED
INCIDENT OPENED
RECOVERY DETECTED
```

Recommended:

-   new ActivityRow: short slide/fade;
-   status transition: short cross-fade;
-   inspector: fast slide;
-   physical control press;
-   recent-change pulse that settles.

Avoid:

-   permanent pulsing;
-   bouncing cards;
-   glowing borders;
-   particles;
-   animated gradients;
-   decorative delays.

Respect `prefers-reduced-motion`.

------------------------------------------------------------------------

# 31. RESPONSIVE STRATEGY

## Desktop

Primary operating surface:

-   full black sidebar;
-   segmented top bar;
-   asymmetric bento;
-   dense activity;
-   side inspector.

## Tablet

-   sidebar may collapse;
-   bento reflows to two columns;
-   inspector becomes overlay where needed.

## Mobile

Do not simply shrink desktop.

Priority:

1.  global state;
2.  attention;
3.  project health;
4.  recent activity;
5.  secondary navigation.

A bottom navigation can be used if it fits the existing app
architecture, but do not force it if a simpler responsive shell
integrates better.

Agent state and Intelligence may be lower in the primary mobile
hierarchy because mobile is primarily for triage.

------------------------------------------------------------------------

# 32. LOADING / EMPTY / ERROR STATES

## Loading

Use structural skeletons matching the final component shapes.

## Empty

Never leave unexplained blank cards.

Example:

``` text
NO ACTIVE INCIDENTS

ALL OBSERVED SYSTEMS ARE CURRENTLY
WITHIN NORMAL OPERATIONAL STATE.
```

## No Agents

``` text
NO AGENTS REPORTING

AGENT AND WORKER TELEMETRY WILL APPEAR
HERE WHEN CONNECTED.
```

## Surface Error

Explain what failed:

``` text
RECENT ACTIVITY UNAVAILABLE

THE REST OF NEO AVO REMAINS OPERATIONAL.

[ RETRY ]
```

Do not imply global failure when only one data surface failed.

------------------------------------------------------------------------

# 33. SECURITY UX

Never expose:

-   API tokens;
-   Telegram bot token;
-   webhook secrets;
-   authorization headers;
-   private keys;
-   credentials;
-   private raw payloads.

Credential UI may show metadata only:

``` text
TELE AUTO CREDENTIAL

ACTIVE
AUTHENTICATION HEALTHY
LAST ROTATED ...
```

No "show secret" feature is required.

------------------------------------------------------------------------

# 34. ACCESSIBILITY

Neo-Brutalist aesthetics must not harm usability.

Requirements:

-   text/icon accompanies semantic color;
-   availability and health use different shape/position;
-   strong keyboard focus;
-   sufficient contrast;
-   readable body typography;
-   monospace only for short machine data;
-   controls have clear hover/focus/pressed/disabled states;
-   reduced-motion support;
-   no meaning conveyed by animation alone.

------------------------------------------------------------------------

# 35. DESIGN ANTI-PATTERNS

Do NOT produce:

-   generic shadcn dashboard;
-   generic Vercel/Linear clone;
-   corporate gray admin panel;
-   glassmorphism;
-   dark-purple AI gradient;
-   cyberpunk terminal aesthetic;
-   crypto dashboard;
-   equal KPI-card wall;
-   meaningless donut charts;
-   fake productivity metrics;
-   fake tasks;
-   fake project progress;
-   fake agents;
-   fake data;
-   random accent colors;
-   excessive pills;
-   giant rounded SaaS cards;
-   glowing AI orb;
-   raw logs on Overview;
-   giant chatbot;
-   arbitrary Restart/Execute/Deploy controls;
-   excessive animation.

------------------------------------------------------------------------

# 36. VISUAL REFERENCE INTERPRETATION

The two approved visual references have different jobs.

## Reference A --- AVO Operational Dashboard

Use for:

-   visual intensity;
-   black sidebar;
-   strong brand block;
-   segmented top bar;
-   editorial page heading;
-   high but controlled information density;
-   chunky icons;
-   visible hard shadows;
-   physical console feeling;
-   strong lime/black contrast;
-   larger semantic color surfaces.

Do **not** copy:

-   task-management content;
-   staff productivity;
-   fake task counts;
-   project completion percentages.

## Reference B --- Neo-Brutalism Component Library

Use for:

-   button language;
-   bento geometry;
-   corner radius;
-   border treatment;
-   hard shadows;
-   tabs;
-   toggles;
-   inputs;
-   dropdowns;
-   chips;
-   tactile microinteractions;
-   playful but controlled palette.

------------------------------------------------------------------------

# 37. CURRENT VS FUTURE CAPABILITY

Every UI feature should be classified mentally during implementation.

## CURRENT / BACKEND-BACKED

Use current repository/API as authority.

Likely areas include:

-   projects;
-   events/activity;
-   availability;
-   health;
-   incidents;
-   Telegram notifier status/config where supported;
-   AI Ops capability where supported;
-   system health.

## DATA-DEPENDENT

Render only when actual telemetry exists:

-   agents/workers;
-   model/provider;
-   token/cost;
-   rich run lifecycle;
-   project-specific context dimensions.

## FUTURE

Do not pretend these already exist:

-   generic bounded commands;
-   arbitrary project controls;
-   deployment controls;
-   universal agent management;
-   incident mutation actions if backend does not support them.

------------------------------------------------------------------------

# 38. IMPLEMENTATION PRIORITY

Codex should implement in a coherent pass.

Recommended sequence:

``` text
1. Inspect current app/routes/data contracts
2. Establish design tokens
3. Build/refactor shared primitives
4. Replace global shell
5. Implement Overview
6. Projects + Project Workspace
7. Activity + Inspector
8. Incidents / Attention
9. Agents truthful state
10. Intelligence
11. Settings
12. Search/Command Palette where supported
13. Responsive behavior
14. Loading/empty/error states
15. Final visual consistency + regression validation
```

Do not repeatedly redesign individual pages in isolation.

------------------------------------------------------------------------

# 39. IMPLEMENTATION SAFETY

This is a UI redesign, not an architecture rewrite.

Preserve:

-   production API contracts;
-   database behavior;
-   worker behavior;
-   ingestion behavior;
-   Tele Auto integration;
-   authentication;
-   Telegram notifier;
-   production configuration;
-   operational invariants.

Do not alter backend semantics merely to simplify UI implementation.

If a backend capability is missing, prefer:

``` text
truthful empty/read-only state
```

over:

``` text
new speculative backend system
```

unless explicitly required for an already-existing product contract.

------------------------------------------------------------------------

# 40. DATA RULE

**Production UI must use real application data.**

Mock data is acceptable only in isolated development/story/demo fixtures
where already customary.

Never ship fake operational data to make the interface look full.

Examples:

If only Tele Auto is registered:

``` text
SHOW TELE AUTO
```

not:

``` text
PROJECT A
PROJECT B
PROJECT C
```

If no agents report:

``` text
NO AGENTS REPORTING
```

not:

``` text
AGENT-1
AGENT-2
SYNC-AGENT
```

------------------------------------------------------------------------

# 41. VISUAL QUALITY BAR

The first Claude prototype was functionally coherent but visually too
restrained.

Do not reproduce that level of restraint.

The final implementation should have:

-   stronger black structural shell;
-   much stronger AVO branding;
-   larger editorial typography;
-   more visible hard shadows;
-   chunkier control blocks;
-   tighter information density;
-   larger meaningful accent surfaces;
-   clearer visual hierarchy;
-   a physical control-panel feeling.

At the same time, do not regress into the fake task-management content
of the visual reference.

The target is:

> **ChatGPT reference visual energy + Claude operational UX discipline +
> real Neo AVO product truth.**

------------------------------------------------------------------------

# 42. SCREEN SET

The coherent product system should cover:

1.  Overview
2.  Projects
3.  Project Workspace
4.  Activity
5.  Event/Run Inspector
6.  Incidents / Attention
7.  Incident Detail / Inspector
8.  Agents
9.  Agent Inspector where data exists
10. Intelligence
11. Settings --- Projects
12. Settings --- Notifications
13. Settings --- Integrations
14. Settings --- System
15. Global Search / Command Palette where supported
16. Empty states
17. Loading states
18. Surface error/degraded states
19. Critical state
20. Responsive/mobile Overview

------------------------------------------------------------------------

# 43. TARGET EXPERIENCE

Ideal operator flow:

``` text
OPEN NEO AVO
      ↓
ALL SYSTEMS OPERATIONAL?
      ↓
ANYTHING NEEDS ATTENTION?
      ↓
WHAT JUST HAPPENED?
      ↓
WHAT ARE PROJECTS / AGENTS DOING?
      ↓
WHY DID SOMETHING GO WRONG?
      ↓
INVESTIGATE ONLY IF NEEDED
```

The UI reduces cognitive load.

It does not maximize visible metrics.

------------------------------------------------------------------------

# 44. DEFINITION OF DONE

The redesign is done when:

-   the global shell clearly reflects the final Neo-Brutalist
    control-room direction;
-   all major pages share one coherent design system;
-   Overview answers operational state immediately;
-   black sidebar + strong AVO identity are implemented;
-   top bar behaves like a segmented operations control strip;
-   page titles have strong editorial hierarchy;
-   semantic color is expressive but meaningful;
-   availability and health remain visually distinct;
-   real data is used;
-   unsupported capabilities are not fabricated;
-   empty states are intentional;
-   Activity is not a raw-log viewer;
-   AI interpretation is visibly distinct from machine truth;
-   responsive behavior is intentional;
-   keyboard/focus/reduced-motion basics are preserved;
-   production backend behavior and Tele Auto integration are not
    regressed;
-   build/typecheck/tests relevant to the changed surfaces pass;
-   there are no obvious generic-template remnants;
-   the result visually feels like **Neo AVO**, not a UI kit or admin
    starter.

------------------------------------------------------------------------

# 45. FINAL MANTRA

> **OBSERVE FIRST.**

> **ATTENTION FIRST.**

> **TRUTH BEFORE DECORATION.**

> **PLAYFUL VISUAL LANGUAGE. SERIOUS OPERATIONAL INFORMATION.**

> **NEO-BRUTALIST OUTSIDE. DISCIPLINED OPERATIONS SYSTEM INSIDE.**

> **CONTROL ROOM, NOT ADMIN DASHBOARD.**
