import { describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listIncidents: vi.fn(),
}));

vi.mock("../src/incidents/repository", () => ({
  listIncidents: repo.listIncidents,
}));

vi.mock("../src/db/client", () => ({
  withConfiguredDb: vi.fn((cb) => cb({})),
}));

import { GET } from "../app/api/v1/dashboard/incidents/export/route";
import { NextRequest } from "next/server";

describe("GET /api/v1/dashboard/incidents/export", () => {
  it("exports incidents as downloadable JSON attachment", async () => {
    const mockIncidents = [
      {
        id: "inc-1",
        projectId: "proj-a",
        severity: "HIGH",
        state: "OPEN",
        reason: "Test incident",
      },
    ];
    repo.listIncidents.mockResolvedValue(mockIncidents);

    const req = new NextRequest("http://localhost:3000/api/v1/dashboard/incidents/export?projectId=proj-a");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("attachment; filename=\"neo-avo-issues-");
    
    const body = await res.json();
    expect(body).toEqual(mockIncidents);
    expect(repo.listIncidents).toHaveBeenCalledWith(expect.anything(), "proj-a");
  });
});
