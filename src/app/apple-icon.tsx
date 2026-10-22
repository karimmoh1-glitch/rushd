import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1C1B19" }}>
        <svg width="132" height="132" viewBox="0 0 32 32">
          <path d="M6 24C10 21.3 12.2 18.6 16.5 16.8S22.6 11.6 24.6 9" fill="none" stroke="#F8F6F1" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="6" cy="24" r="2" fill="#F8F6F1" />
          <circle cx="11.2" cy="20.2" r="2" fill="#F8F6F1" />
          <circle cx="16.5" cy="16.8" r="2" fill="#F8F6F1" />
          <circle cx="24.6" cy="9" r="3.5" fill="#E5A63B" />
        </svg>
      </div>
    ),
    size,
  );
}
