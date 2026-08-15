import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["./src/test/setup-integration.ts"],
    // Integration tests share one Postgres database and clean up after
    // themselves — running them concurrently risks cross-test interference.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "server-only": path.resolve(import.meta.dirname, "./src/test/server-only-stub.ts"),
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
