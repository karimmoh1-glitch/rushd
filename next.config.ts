import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    // Next.js logs every Server Function call WITH ITS ARGUMENTS by default.
    // Several actions receive secrets (Canvas access tokens, passwords), and
    // secrets must never reach logs — so this stays off in every environment.
    serverFunctions: false,
  },
  poweredByHeader: false,
  experimental: {
    // Photos are compressed in the browser first (src/lib/upload/compress.ts);
    // this stays under Vercel's 4.5 MB request-body limit.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async redirects() {
    return [
      { source: "/classes", destination: "/courses", permanent: true },
      { source: "/classes/:path*", destination: "/courses/:path*", permanent: true },
      { source: "/insights", destination: "/mastery/habits", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Script sources are left to Next's defaults; these directives
          // only block framing, plugin content, and base/form hijacking.
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
