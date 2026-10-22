import { ImageResponse } from "next/og";

export const alt = "Plan my finals: a free exam study planner from Rushd";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Example plan only.
const DAYS: [string, [string, string, string][]][] = [
  ["Mon", [["AP Bio final", "7:00 PM", "#0d9488"]]],
  ["Tue", [["AP Bio final", "7:00 PM", "#0d9488"], ["Calc final", "8:10 PM", "#7c3aed"]]],
  ["Wed", [["Spanish oral", "7:00 PM", "#be123c"], ["Calc final", "8:10 PM", "#7c3aed"]]],
  ["Sat", [["Calc final", "1:00 PM", "#7c3aed"]]],
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
            <div style={{ fontSize: 88, lineHeight: 1, letterSpacing: -3 }}>Plan my finals.</div>
            <div style={{ fontSize: 28, fontFamily: "sans-serif", color: "#A8A49B", lineHeight: 1.35 }}>List your tests. Get every study session, day by day. Free, no sign&#8209;up.</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, flex: 1, fontFamily: "sans-serif" }}>
          {DAYS.map(([day, sessions]) => (
            <div key={day} style={{ display: "flex", gap: 24, borderTop: "2px solid #34322E", paddingTop: 16 }}>
              <div style={{ width: 70, fontSize: 26, color: "#A8A49B" }}>{day}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {sessions.map(([t, time, c]) => (
                  <div key={t + time} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
                    <div style={{ flex: 1 }}>{t}</div>
                    <div style={{ fontFamily: "monospace", color: "#A8A49B", fontSize: 22 }}>{time}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
