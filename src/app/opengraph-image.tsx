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
          backgroundColor: "#0a0a12",
          backgroundImage:
            "radial-gradient(circle at 82% 18%, rgba(129,140,248,0.35), transparent 55%), radial-gradient(circle at 8% 92%, rgba(99,102,241,0.22), transparent 45%)",
          padding: "90px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontSize: 78, fontWeight: 700, color: "#f4f4f8", letterSpacing: -2 }}>
            Rushd
          </span>
          <span style={{ fontSize: 40, color: "#818cf8" }}>رُشد</span>
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 34,
            color: "#b8bcc8",
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
            color: "#818cf8",
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
