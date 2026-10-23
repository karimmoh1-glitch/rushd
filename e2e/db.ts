import { neonConfig } from "@neondatabase/serverless";

// Same connection rules as src/lib/db.ts: Neon by default, or a local
// Postgres through scripts/local-db-proxy.mjs when LOCAL_DB_PROXY is set.
export function configureNeon() {
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const proxy = process.env.LOCAL_DB_PROXY;
  if (proxy) {
    neonConfig.wsProxy = (host, port) => `${proxy}/v1?address=${host}:${port}`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;
  }
}
