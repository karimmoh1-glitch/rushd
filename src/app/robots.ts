import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://therushd.com";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/courses",
        "/assignments",
        "/exams",
        "/settings",
        "/admin",
        "/onboarding",
        "/api",
        "/plan",
        "/tutor",
        "/practice",
        "/mastery",
        "/more",
        "/upgrade",
        "/import",
        "/integrations",
        "/profile",
        "/how-rushd-thinks",
        "/reset-password",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
