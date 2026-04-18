import { ImageResponse } from "next/og"

export const alt = "GoCast — Live Radio Streaming"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background:
            "radial-gradient(circle at 20% 30%, #2d1b69 0%, transparent 50%), radial-gradient(circle at 80% 70%, #3a1a5c 0%, transparent 50%), #0b0614",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "#8B5CF6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: -2,
            }}
          >
            G
          </div>
          <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>GoCast</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 88,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1.05,
              maxWidth: 900,
            }}
          >
            Your voice, on air in 60 seconds.
          </div>
          <div style={{ fontSize: 32, color: "rgba(255,255,255,0.65)", letterSpacing: -0.5 }}>
            Broadcast live radio from your browser.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 500 }}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: "#10b981" }} />
          <div style={{ color: "#10b981", textTransform: "uppercase", letterSpacing: 3 }}>Live</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
