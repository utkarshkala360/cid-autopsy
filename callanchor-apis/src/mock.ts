// Serves the redacted fixtures with the real login flow, so everything here can
// run without touching production. Usage: npm run mock
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { operations } from "./spec.ts";

const COOKIE = "callanchor_portal_session=mock-session";

const routes = operations.map((op) => ({
  op,
  pattern: new RegExp(`^${op.path.replace(/{\w+}/g, "[^/]+")}$`),
}));

export function startMock(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    const route = routes.find((r) => r.pattern.test(url.pathname) && r.op.method.toUpperCase() === req.method);
    const reply = (status: number, body: unknown, headers = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));
    };
    if (!route) return reply(404, { error: "not found" });
    if (route.op.safety !== "auth" && !req.headers.cookie?.includes(COOKIE)) {
      return reply(401, { error: "unauthorized" });
    }
    const file = new URL(`../fixtures/${route.op.id}.json`, import.meta.url);
    if (!existsSync(file)) return reply(500, { error: "no fixture" });
    const headers = route.op.id === "verifyOtp" ? { "Set-Cookie": `${COOKIE}; Path=/; HttpOnly` } : {};
    reply(200, JSON.parse(readFileSync(file, "utf8")), headers);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 4010);
  await startMock(port);
  console.log(`Mock CallAnchor on http://localhost:${port}`);
}
