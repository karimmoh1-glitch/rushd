import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal config for the first deploy — no R2 incremental cache override
// yet (see wrangler.jsonc). Revisit once there's a real need to tune
// caching behavior.
export default defineCloudflareConfig({});
