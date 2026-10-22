import { ImageResponse } from "next/og";

export const alt = "Rank my homework: a free assignment prioritizer from Rushd";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Example rows only; shared links never put a student's list in the image.
const ROWS: [string, string, number, boolean][] = [
  ["Calc quiz", "Exam is tomorrow", 77, true],
  ["History reading notes", "Due today", 69, false],
  ["Lab report", "Due tomorrow", 64, false],
  ["Essay draft", "Due in 5 days", 44, false],
];

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#161514", color: "#F2F0EB", padding: "72px 80px", fontFamily: "serif", gap: 64 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 470 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34 }}>
            <svg width="44" height="44" viewBox="0 0 32 32">
              <path d="M5 24.5C9.5 21.5 12 18.5 17 16.5S23.5 11 25.5 8.5" fill="none" stroke="#F2F0EB" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="5" cy="24.5" r="2.3" fill="#F2F0EB" />
              <circle cx="11" cy="20" r="2.3" fill="#F2F0EB" />
              <circle cx="17" cy="16.5" r="2.3" fill="#F2F0EB" />
              <circle cx="25.5" cy="8.5" r="3.8" fill="#E5A63B" />
            </svg>
            Rushd
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 84, lineHeight: 1, letterSpacing: -3 }}>Rank my homework.</div>
            <div style={{ fontSize: 28, fontFamily: "sans-serif", color: "#A8A49B", lineHeight: 1.35 }}>Type what&apos;s due. Get it ranked by what needs you first. Free, no sign‑up.</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 16, flex: 1 }}>
          {ROWS.map(([t, why, pulse, top]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `2px solid ${top ? "#E5A63B" : "#34322E"}`, borderRadius: 16, padding: "18px 24px", background: "#1E1D1B", fontFamily: "sans-serif" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 28 }}>{t}</div>
                <div style={{ fontSize: 20, color: "#A8A49B" }}>{why}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 30, fontFamily: "monospace" }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: pulse >= 70 ? "#E5A63B" : "#F2F0EB" }} />
                {pulse}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
