import type { MetadataRoute } from "next";

/**
 * Makes the site installable as an app (home screen, dock, start menu). The icons in
 * public/ are the header's blue badge; the maskable one leaves room for the OS's crop.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "COTS-IL",
    short_name: "COTS-IL",
    description: "ציוד FRC ו-FTC מכל הספקים בהזמנה אחת, במחירים בשקלים לפי שער בנק ישראל",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F6F9FF",
    theme_color: "#EEF1FF",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
