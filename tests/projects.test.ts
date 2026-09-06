import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findActiveCredential: vi.fn(),
  findProjectById: vi.fn(),
}));

vi.mock("../src/projects/repository", () => ({
  findActiveCredential: mocks.findActiveCredential,
  findProjectById: mocks.findProjectById,
  insertCredential: vi.fn(),
  insertProject: vi.fn(),
  revokeCredentials: vi.fn(),
  updateProject: vi.fn(),
}));

import { createProjectToken, hashProjectToken } from "../src/projects/credentials";
import { authenticateProject } from "../src/projects/usecases";

describe("project credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a one-time opaque token and stores only its digest", () => {
    const generated = createProjectToken();
    expect(generated.token).toMatch(/^neo_[A-Za-z0-9_-]{43}$/);
    expect(generated.hash).toBe(hashProjectToken(generated.token));
    expect(generated.hash).not.toContain(generated.token);
    expect(generated.prefix).toBe(generated.token.slice(0, 12));
  });

  it("scopes authentication lookup to both project and environment", async () => {
    const generated = createProjectToken();
    mocks.findActiveCredential.mockImplementation(async (_db, projectId, environment) =>
      projectId === "project-a" && environment === "production" ? { projectId, tokenHash: generated.hash } : null,
    );
    mocks.findProjectById.mockResolvedValue({ id: "project-a", environment: "production" });

    const valid = await authenticateProject({} as never, "project-a", "production", generated.token);
    const wrongToken = await authenticateProject({} as never, "project-a", "production", "neo_wrong");
    const wrongProject = await authenticateProject({} as never, "project-b", "production", generated.token);
    const wrongEnvironment = await authenticateProject({} as never, "project-a", "staging", generated.token);

    expect(valid).toEqual({ id: "project-a", environment: "production" });
    expect(wrongToken).toBeNull();
    expect(wrongProject).toBeNull();
    expect(wrongEnvironment).toBeNull();
    expect(mocks.findActiveCredential).toHaveBeenCalledWith(expect.anything(), "project-b", "production");
  });
});
