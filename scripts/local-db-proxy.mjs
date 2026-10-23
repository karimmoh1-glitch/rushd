// Development only: lets the app (which always talks to Postgres through
// Neon's WebSocket driver) use a plain local Postgres. It forwards each
// WebSocket connection to the Postgres address the driver asks for.
//
//   node scripts/local-db-proxy.mjs            # listens on localhost:5433
//   LOCAL_DB_PROXY=localhost:5433 DATABASE_URL=postgresql://you@localhost:5432/rushd_test npm run dev
//
// Never used in production: db.ts only switches to it when LOCAL_DB_PROXY is set.

import net from "node:net";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.LOCAL_DB_PROXY_PORT ?? 5433);
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const server = new WebSocketServer({ port: PORT, host: "127.0.0.1" });

server.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const [host, port] = (url.searchParams.get("address") ?? "localhost:5432").split(":");

  // Only ever forward to a database on this machine.
  if (!ALLOWED_HOSTS.has(host)) {
    socket.close(1008, "Only local databases are allowed");
    return;
  }

  const postgres = net.connect(Number(port) || 5432, host);
  socket.on("message", (data) => postgres.write(data));
  postgres.on("data", (data) => socket.send(data));
  socket.on("close", () => postgres.end());
  postgres.on("close", () => socket.close());
  postgres.on("error", () => socket.close());
  socket.on("error", () => postgres.destroy());
});

console.log(`Local Postgres proxy listening on ws://127.0.0.1:${PORT}`);
