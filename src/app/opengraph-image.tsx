import { ImageResponse } from "next/og";

export const alt = "Rushd: your personal AI study agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social preview in the Rushd identity: paper, ink, and the saffron node at
// the end of the path (the mark's three points are the dots of ش).
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
          padding: "84px 92px",
          background: "#F8F6F1",
          color: "#18202F",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 32 32">
            <path d="M5 24.5C9.5 21.5 12 18.5 17 16.5S23.5 11 25.5 8.5" fill="none" stroke="#18202F" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="5" cy="24.5" r="2.3" fill="#18202F" />
            <circle cx="11" cy="20" r="2.3" fill="#18202F" />
            <circle cx="17" cy="16.5" r="2.3" fill="#18202F" />
            <circle cx="25.5" cy="8.5" r="3.8" fill="#E5A63B" />
          </svg>
          <div style={{ fontSize: 44 }}>Rushd</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 30, fontFamily: "sans-serif", color: "#5D6577", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#E5A63B" }} />
            Your personal AI study agent
          </div>
          <div style={{ fontSize: 96, letterSpacing: -3, lineHeight: 1 }}>Master any subject.</div>
        </div>
        <div style={{ fontSize: 26, fontFamily: "sans-serif", color: "#5D6577" }}>
          Learns your classes · quizzes you · finds the gap · picks what to watch next
        </div>
      </div>
    ),
    size,
  );
}
