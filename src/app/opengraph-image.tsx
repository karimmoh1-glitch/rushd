import { ImageResponse } from "next/og";

export const alt = "Rushd: your personal AI learning system";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social preview in the product's identity: ivory, midnight ink, one indigo accent.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px 88px",
          background: "#FAF8F3",
          color: "#151829",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 600 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#3B3FA8", color: "#FAF8F3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>r</div>
          Rushd
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 74, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>Your personal AI learning system.</div>
          <div style={{ fontSize: 30, color: "#5B6075", lineHeight: 1.4, maxWidth: 940 }}>
            Learn from your own courses, check your work, see what you&apos;ve mastered, and know what to study next.
          </div>
        </div>
        <div style={{ fontSize: 26, color: "#3B3FA8" }}>therushd.com</div>
      </div>
    ),
    size,
  );
}
