import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rushd",
    short_name: "Rushd",
    description: "Your personal AI study agent.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#161514",
    theme_color: "#161514",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
