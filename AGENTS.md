# Neo AVO Agent Governance

The canonical engineering instructions are in `docs/00_START_HERE.md` and the documents in its read order. Neo AVO is a modular monolith with separate web and worker lifecycles. Keep domain logic out of the UI, keep PostgreSQL access in `src/db`, and do not change frozen architecture decisions without an ADR.
