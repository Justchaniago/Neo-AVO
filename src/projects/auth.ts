import type { NextRequest } from "next/server";

import { withConfiguredDb } from "../db/client";
import { authenticateProject } from "./usecases";

export async function authenticateProjectRequest(request: NextRequest, projectId: string) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  const environment = request.headers.get("x-neo-avo-environment");
  if (!token || !environment) return null;

  return withConfiguredDb((db) => authenticateProject(db, projectId, environment, token));
}
