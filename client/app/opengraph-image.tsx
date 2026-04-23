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
          padding: 64,
          background:
            "radial-gradient(circle at 22% 20%, rgba(139,92,246,0.34), transparent 34%), radial-gradient(circle at 82% 82%, rgba(16,185,129,0.16), transparent 32%), #09090f",
          color: "white",
          fontFamily: "Inter, Arial, sans-serif",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            gap: 54,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 12,
                  background: "#8b5cf6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 34,
                  fontWeight: 800,
                }}
              >
                G
              </div>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 750 }}>GoCast</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#34d399",
                  fontSize: 19,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: "#34d399" }} />
                Browser-based radio
              </div>
              <div
                style={{
                  display: "flex",
                  fontSize: 78,
                  fontWeight: 800,
                  lineHeight: 1.02,
                  maxWidth: 650,
                }}
              >
                Live radio from your browser.
              </div>
              <div style={{ display: "flex", fontSize: 29, lineHeight: 1.35, color: "rgba(255,255,255,0.72)", maxWidth: 610 }}>
                Start a station, go on air, and share one listener link.
              </div>
            </div>

            <div style={{ display: "flex", gap: 14, color: "rgba(255,255,255,0.78)", fontSize: 21 }}>
              <div style={{ display: "flex", padding: "10px 16px", borderRadius: 999, background: "rgba(255,255,255,0.07)" }}>No install</div>
              <div style={{ display: "flex", padding: "10px 16px", borderRadius: 999, background: "rgba(255,255,255,0.07)" }}>Free to start</div>
              <div style={{ display: "flex", padding: "10px 16px", borderRadius: 999, background: "rgba(255,255,255,0.07)" }}>One share link</div>
            </div>
          </div>

          <div
            style={{
              width: 385,
              height: 420,
              borderRadius: 28,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.055)",
              boxShadow: "0 34px 80px rgba(0,0,0,0.42)",
              padding: 28,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 11px",
                  borderRadius: 999,
                  background: "rgba(16,185,129,0.14)",
                  color: "#6ee7b7",
                  fontSize: 14,
                  fontWeight: 800,
                  textTransform: "uppercase",
                }}
              >
                <div style={{ display: "flex", width: 7, height: 7, borderRadius: 999, background: "#34d399" }} />
                Live
              </div>
              <div style={{ display: "flex", color: "rgba(255,255,255,0.62)", fontSize: 16 }}>142 listening</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <div
                style={{
                  width: 165,
                  height: 165,
                  borderRadius: 999,
                  background: "linear-gradient(135deg, #24243a, #08080d 48%, #171725)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 999,
                    background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: "#09090f" }} />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                <div style={{ display: "flex", color: "rgba(255,255,255,0.54)", fontSize: 15, textTransform: "uppercase" }}>Now playing</div>
                <div style={{ display: "flex", fontSize: 28, fontWeight: 760 }}>Midnight Jazz Hour</div>
                <div style={{ display: "flex", color: "rgba(255,255,255,0.62)", fontSize: 18 }}>Your live station page</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  background: "#8b5cf6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 900,
                }}
              >
                ▶
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
                  <span>On air</span>
                  <span>32:14</span>
                </div>
                <div style={{ display: "flex", height: 7, borderRadius: 999, background: "rgba(255,255,255,0.09)", overflow: "hidden" }}>
                  <div style={{ display: "flex", width: "55%", height: "100%", background: "linear-gradient(90deg, #8b5cf6, #ec4899)" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
