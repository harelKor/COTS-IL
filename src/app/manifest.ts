import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

/**
 * Makes the site installable as an app (home screen, dock, start menu). The icons in
 * public/ are the header's blue badge; the maskable one leaves room for the OS's crop.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { content } = await getSettings();
  return {
    id: "/",
    name: "BLUEHUB",
    short_name: "BLUEHUB",
    description: content.tagline,
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#020416",
    theme_color: "#020416",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
