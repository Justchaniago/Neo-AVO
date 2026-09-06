import { createConfiguredDb } from "../src/db/client";
import { buildAnalysisContext } from "../src/ops/context";
import { analyzeWithVertex } from "../src/ops/vertex";

const incidentId = process.env.NEO_AVO_SMOKE_INCIDENT_ID;
async function main() {
  if (!incidentId) throw new Error("NEO_AVO_SMOKE_INCIDENT_ID is required");
  const { db, pool } = createConfiguredDb();
  try {
    const context = await buildAnalysisContext(db, incidentId);
    if (!context) throw new Error("incident not found");
    const result = await analyzeWithVertex(context);
    console.log(JSON.stringify({ status: "ok", model: result.model, output: result.output }));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
