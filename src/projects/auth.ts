import type { NextRequest } from "next/server";

import { withConfiguredDb } from "../db/client";
import { findActiveCredentialByToken } from "../events/repository";
import { hashProjectToken, tokenHashesEqual } from "./credentials";
import { findProjectById } from "./repository";
import { authenticateProject } from "./usecases";

export async function authenticateProjectRequest(request: NextRequest, projectId: string) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  const environment = request.headers.get("x-neo-avo-environment");
  if (!token || !environment) return null;

  return withConfiguredDb((db) => authenticateProject(db, projectId, environment, token));
}

export async function authenticateProjectTokenRequest(request: NextRequest) {
  const header = request.headers.get("authorization");
  const environment = request.headers.get("x-neo-avo-environment");
  if (!header?.startsWith("Bearer ") || !environment) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  const tokenHash = hashProjectToken(token);

  return withConfiguredDb(async (db) => {
    const credential = await findActiveCredentialByToken(db, environment, tokenHash);
    if (!credential || !tokenHashesEqual(credential.tokenHash, tokenHash)) return null;
    return findProjectById(db, credential.projectId);
  });
}
