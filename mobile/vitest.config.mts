import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests for plain TypeScript (the API client, formatting). Components
// aren't tested here; the app is checked through Expo's web build.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
