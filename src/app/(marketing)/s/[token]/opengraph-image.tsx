import { ImageResponse } from "next/og";
import { decodeStreakCard, formatStudyTime } from "@/lib/share/streak-card";

export const alt = "A study streak on Rushd";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const card = decodeStreakCard((await params).token);
  const streak = card?.streak ?? 0;
  const lit = Math.min(7, streak);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#161514", color: "#F2F0EB", padding: "72px 84px", fontFamily: "serif" }}>
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
        <div style={{ display: "flex", alignItems: "flex-end", gap: 36 }}>
          <div style={{ display: "flex", fontSize: 220, lineHeight: 0.85, letterSpacing: -8 }}>{streak}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12, fontFamily: "sans-serif" }}>
            <div style={{ display: "flex", fontSize: 44 }}>{`${streak === 1 ? "day" : "days"} of real studying`}</div>
            {card && card.minutes > 0 ? <div style={{ display: "flex", fontSize: 30, color: "#A8A49B" }}>{`${formatStudyTime(card.minutes)} this week`}</div> : <div style={{ display: "flex" }} />}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} style={{ width: 22, height: 22, borderRadius: 11, background: i < lit ? (i === lit - 1 ? "#E5A63B" : "#F2F0EB") : "#34322E" }} />
          ))}
          <div style={{ display: "flex", marginLeft: 24, fontSize: 28, fontFamily: "sans-serif", color: "#A8A49B" }}>Start your own streak at therushd.com</div>
        </div>
      </div>
    ),
    size,
  );
}
