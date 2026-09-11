# Neo AVO — Engineering Rules

These rules apply to both agents.

# 1. Primary Rule

> Build the smallest implementation that satisfies the frozen contract correctly.

# 2. Anti-Slop Rules

Do not add:
- interfaces with only one implementation unless boundary/testing value is concrete;
- factories without multiple construction strategies;
- repository abstractions merely because "clean architecture" suggests them;
- event buses inside the monolith without a current requirement;
- generic plugin systems;
- speculative extension points;
- premature SDKs;
- broad helper libraries with one caller.

# 3. Traceability

A normal operation should be easy to trace.

Preferred:

```text
route
→ schema
→ function
→ database
```

Worker:

```text
claim
→ process
→ projection/rule
→ database
```

# 4. Dependency Rule

Before adding a production dependency, document:
- current requirement;
- why platform/standard library is insufficient;
- maintenance cost.

# 5. Database Rule

Migrations must be:
- explicit;
- reviewable;
- forward-safe;
- small where practical.

Do not create tables for hypothetical future domains.

# 6. Testing Rule

Test behavior that can hurt the system.

Prioritize:
- idempotency;
- ordering;
- expiry;
- authorization;
- failure isolation;
- quarantine;
- incident deduplication.

Do not chase arbitrary coverage.

# 7. Error Handling

Never silently swallow Neo AVO internal failures.

Project adapters may isolate telemetry failures from business results, but Neo AVO itself should retain diagnostic evidence.

# 8. Logging

Structured, concise logs.

Never log:
- credentials;
- secrets;
- full sensitive payloads unnecessarily.

# 9. AI Rule

Do not ask AI to perform deterministic state calculation.

AI output is advisory unless an explicitly approved future policy says otherwise.

# 10. Scope Rule

If a task requires changing a frozen architecture decision:
1. stop implementation of that change;
2. write an ADR proposal;
3. ask Agent B to review;
4. only implement after approval.

# 11. Git Rule

Agents must not make simultaneous edits to the same file.

Prefer small commits aligned to one behavioral change.

Commit messages should state behavior, not vague activity.

# 12. Definition of "Done"

A feature is not done merely because code compiles.

It is done when:
- required behavior works;
- relevant tests pass;
- failure behavior is understood;
- docs/contracts are updated if externally visible;
- Agent B has no unresolved P0/P1 objection for milestone gates.

# 13. Diagnostic Command Safety

Repository searches and diagnostic commands must be strictly scoped to prevent host resource exhaustion:
- Never recursively search filesystem root `/` by default (e.g. `grep -r ... /` or `rg ... /`).
- Scope repository searches to explicit known project directories (e.g. `/opt/neo-avo`, `/opt/briefing-agent`, or local repo root).
- Potentially expensive diagnostic commands must have explicit scope, bounded output (e.g. `head -n 25`), and a timeout when appropriate (e.g. `timeout 30s rg "pattern" /opt/neo-avo`).

# 14. Host Identity Guardrail

Before performing production diagnostics or production mutations, autonomous agents MUST establish target provenance:
- Verify host identity (`hostname`, `uname -a`, `cat /etc/os-release`, `whoami`, `pwd`).
- Minimum required proof: `HOSTNAME`, `OS`, `USER`, `WORKING_DIRECTORY`, `TARGET_PROJECT`, `ENVIRONMENT`.
- Production conclusions, performance diagnoses, or remediation actions MAY NOT be derived from local development machine evidence.




