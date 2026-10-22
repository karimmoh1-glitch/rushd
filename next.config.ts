import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // Next.js logs every Server Function call WITH ITS ARGUMENTS by default.
    // Several actions receive secrets (Canvas access tokens, passwords), and
    // secrets must never reach logs — so this stays off in every environment.
    serverFunctions: false,
  },
};

export default nextConfig;
