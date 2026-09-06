import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, isNull } from "drizzle-orm";

import * as schema from "../db/schema";
import { events, projectCredentials } from "../db/schema";

type QueryDb = Pick<NodePgDatabase<typeof schema>, "insert" | "select">;

export async function insertEvents(db: QueryDb, rows: typeof events.$inferInsert[]) {
  return db.insert(events).values(rows).onConflictDoNothing({ target: events.eventId }).returning({ eventId: events.eventId });
}

export async function findActiveCredentialByToken(db: QueryDb, environment: string, tokenHash: string) {
  const [credential] = await db.select().from(projectCredentials).where(and(eq(projectCredentials.environment, environment), eq(projectCredentials.tokenHash, tokenHash), isNull(projectCredentials.revokedAt))).limit(1);
  return credential;
}
