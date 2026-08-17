"use client";

import { useEffect } from "react";

// Last-resort boundary — only fires if the root layout itself throws (rare;
// (app)/error.tsx and (marketing)/error.tsx-equivalents catch everything
// else). Must render its own <html>/<body> since it replaces the root
// layout when active. Kept dependency-free and inline-styled on purpose —
// if the root layout is broken, nothing that layout provides (fonts, theme,
// Tailwind) can be trusted to still work.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#0a0a0a",
          color: "#f4f4f5",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>Rushd hit an unexpected error.</h1>
        <p style={{ marginTop: "8px", fontSize: "14px", color: "#a1a1aa", maxWidth: "360px" }}>
          Try reloading the page. If this keeps happening, let us know from the feedback button.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "24px",
            padding: "8px 20px",
            borderRadius: "6px",
            backgroundColor: "#818cf8",
            color: "#0a0a0a",
            fontWeight: 500,
            fontSize: "14px",
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
