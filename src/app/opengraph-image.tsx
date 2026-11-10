import { ImageResponse } from "next/og";

/** The share card for WhatsApp and the like: home, catalog and shared carts. Latin only, so no font needs loading. */
export const alt = "COTS-IL: FRC and FTC parts from every supplier, in one order";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          alignItems: "center",
          gap: 28,
          background: "linear-gradient(180deg, #DCE8FF 0%, #F6F9FF 55%, #FFFFFF 100%)",
          color: "#0B1528",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 32,
              background: "linear-gradient(135deg, #1E3A8A, #2563EB)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 56,
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -4, color: "#1D4ED8" }}>COTS-IL</div>
        </div>
        <div style={{ fontSize: 44, color: "#52658A" }}>FRC / FTC parts from every supplier, in one order</div>
        <div style={{ display: "flex", gap: 16, fontSize: 32, fontWeight: 600 }}>
          {["AndyMark", "WCP", "CTRE", "The Thrifty Bot"].map((s) => (
            <div key={s} style={{ padding: "10px 24px", borderRadius: 999, background: "white", border: "2px solid #D8E4FA" }}>
              {s}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
