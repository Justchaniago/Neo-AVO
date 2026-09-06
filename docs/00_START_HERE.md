# Neo AVO — Engineering Governance Pack

**Status:** Architecture Frozen for V1 Baseline  
**Date:** 2026-09-06  
**Purpose:** Shared source of truth for two independent engineering agents working on Neo AVO.

## Final Verdict

Neo AVO is ready to move from architecture review into implementation.

The architecture has completed:
1. Initial PRD design.
2. Adversarial Red Team review.
3. Architecture counter-review.
4. Red Team rebuttal.
5. Final reconciliation.

The resulting design is intentionally conservative: mature contracts, simple physical architecture.

> Neo AVO is an observe-first operations hub with bounded control and an optional AI operations intelligence layer.

The central invariant is:

> **No connected project may depend on Neo AVO to perform its core function.**

## Read Order

Every agent MUST read these files before modifying code:

1. `01_PRD_FINAL_v1.1.md`
2. `02_SYSTEM_DESIGN.md`
3. `03_ARCHITECTURE_DECISIONS.md`
4. `04_ENGINEERING_RULES.md`
5. `05_IMPLEMENTATION_PLAN.md`
6. `06_MULTI_AGENT_WORKFLOW.md`
7. The agent-specific role file:
   - `07_AGENT_A_IMPLEMENTER.md`
   - `08_AGENT_B_ARCHITECT_REVIEWER.md`

## Source-of-Truth Priority

If documents conflict, use this order:

1. `01_PRD_FINAL_v1.1.md`
2. `03_ARCHITECTURE_DECISIONS.md`
3. `02_SYSTEM_DESIGN.md`
4. `04_ENGINEERING_RULES.md`
5. `05_IMPLEMENTATION_PLAN.md`
6. Agent role documents

Do not silently reinterpret an architectural invariant.

## Change Control

Architecture is now frozen for baseline implementation.

A change is an **architecture change** if it modifies:
- project independence;
- event envelope semantics;
- event durability;
- ordering rules;
- command delivery semantics;
- command safety;
- core domain ownership;
- web/worker runtime separation;
- data ownership;
- AI critical-path rules;
- external integration contract.

Architecture changes require an ADR proposal and review by Agent B before Agent A implements them.

Ordinary implementation choices do not require ADRs.
