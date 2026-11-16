import { ImageResponse } from "next/og";
import { shareCardLine } from "@/domain/site-text";
import { getFacets } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";

/**
 * The share card for WhatsApp and the like: home, catalog and shared carts. Latin only, so no font needs
 * loading: the site tagline shows on it when the admin wrote it in English (Hebrew letters can't be drawn here).
 */
export const alt = "BLUEHUB: FRC and FTC parts from every supplier, in one order";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // The vendors on the site, from the catalog (the cached facets), so a new one appears by itself.
  // A failed read leaves the pills out; the card still renders.
  const { content } = await getSettings();
  const line = shareCardLine(content.tagline);
  const suppliers = await getFacets()
    .then((f) => f.suppliers)
    .catch(() => []);
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
          <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: -4, color: "#1D4ED8" }}>BLUEHUB</div>
        </div>
        <div style={{ fontSize: 44, color: "#52658A", textAlign: "center", maxWidth: 1080 }}>{line}</div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, maxWidth: 1080, fontSize: 30, fontWeight: 600 }}>
          {suppliers.map((s) => (
            <div key={s.code} style={{ padding: "8px 22px", borderRadius: 999, background: "white", border: "2px solid #D8E4FA" }}>
              {s.name}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
