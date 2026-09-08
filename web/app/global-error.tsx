"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100dvh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</p>
          <p style={{ fontSize: 14, opacity: 0.7 }}>
            Your logged sets are safe — try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ height: 44, borderRadius: 12, padding: "0 20px" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
