import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";

export type RepositoryContext = { provider: string; repository: string; files: { path: string; excerpt: string }[]; commits: { id: string; message: string; occurredAt: string }[]; unavailable?: string };
export interface RepositoryContextProvider { getContext(input: { owner: string; repository: string; branch: string; hints: string[] }): Promise<RepositoryContext>; }

const SAFE_PATH = /(^|\/)(README|ARCHITECTURE|package\.json|Dockerfile|docker-compose|.*\.(ts|tsx|js|json|ya?ml|md))$/i;
function safeText(value: string) { return value.replace(/(?:token|secret|password|api[_-]?key)\s*[:=].*/gi, "[redacted]").slice(0, 8_000); }

/** GitHub REST GET-only provider. It deliberately has no write endpoints or methods. */
export class GitHubRepositoryContextProvider implements RepositoryContextProvider {
  constructor(private readonly token = process.env.GITHUB_READ_TOKEN) {}
  private async get(path: string) {
    const response = await fetch(`https://api.github.com${path}`, { headers: { accept: "application/vnd.github+json", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`github_read_failed_${response.status}`);
    return response.json() as Promise<unknown>;
  }
  async getContext({ owner, repository, branch, hints }: { owner: string; repository: string; branch: string; hints: string[] }) {
    const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    const [tree, commits] = await Promise.all([this.get(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`), this.get(`${base}/commits?sha=${encodeURIComponent(branch)}&per_page=5`)]);
    const paths = Array.isArray((tree as { tree?: unknown[] }).tree) ? (tree as { tree: { path?: string; type?: string }[] }).tree.filter((entry) => entry.type === "blob" && entry.path && SAFE_PATH.test(entry.path) && (hints.length === 0 || hints.some((hint) => entry.path!.toLowerCase().includes(hint.toLowerCase())))).slice(0, 8) : [];
    const files = await Promise.all(paths.map(async (entry) => {
      const result = await this.get(`${base}/contents/${entry.path}?ref=${encodeURIComponent(branch)}`) as { content?: string; encoding?: string };
      const content = result.encoding === "base64" && result.content ? Buffer.from(result.content, "base64").toString("utf8") : "";
      return { path: entry.path!, excerpt: safeText(content) };
    }));
    return { provider: "github", repository: `${owner}/${repository}`, files, commits: Array.isArray(commits) ? commits.slice(0, 5).map((commit: { sha?: string; commit?: { message?: string; author?: { date?: string } } }) => ({ id: commit.sha?.slice(0, 12) ?? "unknown", message: safeText(commit.commit?.message ?? ""), occurredAt: commit.commit?.author?.date ?? "" })) : [] };
  }
}

export async function repositoryContextForIncident(db: NodePgDatabase<typeof schema>, projectId: string, hints: string[]): Promise<RepositoryContext | null> {
  const [mapping] = await db.select().from(schema.projectRepositories).where(and(eq(schema.projectRepositories.projectId, projectId), eq(schema.projectRepositories.readOnly, "true"))).limit(1);
  if (!mapping || mapping.provider !== "github") return null;
  try { return await new GitHubRepositoryContextProvider().getContext({ owner: mapping.owner, repository: mapping.repository, branch: mapping.defaultBranch, hints }); }
  catch (error) { return { provider: "github", repository: `${mapping.owner}/${mapping.repository}`, files: [], commits: [], unavailable: error instanceof Error ? error.message : "repository_context_unavailable" }; }
}
