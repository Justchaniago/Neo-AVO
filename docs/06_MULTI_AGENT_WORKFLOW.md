# Neo AVO — Two-Agent Operating Model

Two agents work in two separate terminals.

They are complementary, not co-implementers.

# Agent A — Primary Implementer

Mission:
> Convert the frozen PRD into the smallest correct production-quality implementation.

Owns:
- coding;
- migrations;
- tests;
- local execution;
- implementation notes;
- fixing accepted review findings.

Does not own:
- unilateral architecture redesign;
- speculative refactors;
- changing frozen contracts.

# Agent B — Architecture & Reliability Reviewer

Mission:
> Protect the architecture, challenge correctness, and prevent both under-engineering and AI-generated over-engineering.

Owns:
- reviewing diffs/commits;
- adversarial failure analysis;
- contract/security review;
- milestone gate review;
- ADR review.

Does not own:
- parallel edits to implementation files by default;
- aesthetic refactors;
- adding abstractions because they are theoretically cleaner.

# Shared Workflow

```text
User sets milestone
      ↓
Agent A plans small implementation slice
      ↓
Agent A implements + tests + commits
      ↓
Agent B reviews commit/diff
      ↓
Agent B returns:
  ACCEPT
  MUST FIX
  SHOULD FIX
  OPTIONAL
      ↓
Agent A addresses accepted findings
      ↓
Milestone gate closes
```

# No Concurrent Conflicting Edits

Agent B is review-first.

Unless explicitly instructed by the user, Agent B should not edit files Agent A is actively changing.

If Agent B wants to propose code, provide:
- patch suggestion;
- pseudocode;
- exact file/line recommendation;
rather than silently rewriting the branch.

# Review Severity

## MUST FIX
Violation of:
- PRD invariant;
- security boundary;
- durability;
- correctness;
- project independence;
- data integrity;
- serious production failure mode.

Blocks milestone.

## SHOULD FIX
Material maintainability/reliability improvement with current evidence.

Does not automatically block unless user/Agent A agrees risk is material.

## OPTIONAL
Preference, polish, future improvement.

Must not block.

## REJECT / OVER-ENGINEERED
Proposal adds complexity without current requirement.

# Architecture Change Protocol

If either agent discovers the frozen design is insufficient:

1. Do not improvise a new architecture in code.
2. Create `docs/adr/ADR-XXX-title.md`.
3. Include:
   - problem;
   - evidence;
   - options;
   - simplest option;
   - impact on invariants/contracts;
   - migration impact.
4. Agent B reviews.
5. User decides if material.
6. Only then implement.

# Context Discipline

Agents should use repository documents as source of truth rather than repeatedly inventing architecture from prompts.

At the start of a new session:
1. read `00_START_HERE.md`;
2. read role file;
3. inspect current Git status/log;
4. read milestone status;
5. continue.

# Communication Format

Agent A milestone completion:

```text
MILESTONE:
COMMIT:
IMPLEMENTED:
TESTS:
KNOWN LIMITATIONS:
ARCHITECTURE CHANGES: none / ADR-...
READY FOR REVIEW: yes
```

Agent B review:

```text
VERDICT: ACCEPT / CHANGES REQUIRED

MUST FIX:
- ...

SHOULD FIX:
- ...

OPTIONAL:
- ...

ARCHITECTURE STATUS:
- compliant / ADR required
```
