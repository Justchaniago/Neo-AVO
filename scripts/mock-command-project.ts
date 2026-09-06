import { createServer } from "node:http";

const expected = process.env.MOCK_COMMAND_AUTH;
const port = Number(process.env.MOCK_COMMAND_PORT ?? 8787);
const processed = new Set<string>();
const server = createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/commands") { response.writeHead(404).end(); return; }
  if (expected && request.headers.authorization !== `Bearer ${expected}`) { response.writeHead(401).end(); return; }
  let body = "";
  request.on("data", (chunk) => { body += chunk; if (body.length > 100_000) request.destroy(); });
  request.on("end", () => {
    try {
      const command = JSON.parse(body) as { commandId?: string; validUntil?: string };
      if (!command.commandId || !command.validUntil || new Date(command.validUntil) <= new Date()) { response.writeHead(400).end(); return; }
      const alreadyProcessed = processed.has(command.commandId);
      processed.add(command.commandId);
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: alreadyProcessed ? "already_processed" : "accepted" }));
    } catch { response.writeHead(400).end(); }
  });
});
server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ component: "mock_command_project", status: "ready", port })));
process.once("SIGTERM", () => server.close(() => process.exit(0)));
