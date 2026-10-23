import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy. Everything the browser loads comes from this site:
// fonts are self-hosted by next/font, photos are previewed from blob: URLs,
// and Stripe/Microsoft are full-page redirects (not embedded), so they need
// no entries. 'unsafe-inline' stays on script-src because Next's App Router
// streams inline <script> tags without a nonce unless every page is rendered
// per request through a proxy (see docs/SECURITY.md, "CSP"). Dev adds
// 'unsafe-eval' (React's dev tooling) and ws: for hot reload.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

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
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // Two years, all subdomains. Not "preload": joining the browser
          // preload list is hard to undo and needs every subdomain on HTTPS
          // for good; decide that deliberately (docs/SECURITY.md).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Keeps other windows (e.g. one that opened Rushd) from scripting it.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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
