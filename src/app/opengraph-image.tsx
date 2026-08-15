import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Rushd — a clear plan for the work you actually have";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          backgroundColor: "#ffffff",
          padding: "90px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontSize: 76, fontWeight: 700, color: "#1e2a5e" }}>
            Rushd
          </span>
          <span style={{ fontSize: 40, color: "#8a8f9a" }}>رُشد</span>
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 34,
            color: "#3a3f4a",
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          Turn academic chaos into a clear plan.
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 24,
            color: "#8a8f9a",
            fontFamily: "monospace",
          }}
        >
          therushd.com
        </div>
      </div>
    ),
    { ...size },
  );
}
