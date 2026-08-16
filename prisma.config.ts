// Prisma 6.19 (see docs/ARCHITECTURE.md for why this project is pinned
// below 7.x) reads the datasource URL from schema.prisma's own
// `url = env("DATABASE_URL")`, not from this file — this file only needs
// dotenv loaded first so that env var is actually populated for the CLI.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
