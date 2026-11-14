import { Suspense } from "react";
import { preconnect } from "react-dom";
import type { Metadata, Viewport } from "next";
import { Heebo, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { CartPill } from "@/components/cart-pill";
import { CAPTURE_INSTALL_PROMPT } from "@/lib/install-prompt";
import { SiteFooter } from "@/components/site-footer";
import { FooterGate } from "@/components/footer-gate";
import { SiteHeader } from "@/components/site-header";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { SiteFactsProvider } from "@/components/site-facts-provider";
import { Toaster } from "@/components/toast";
import "./globals.css";
import { siteUrl } from "@/lib/site-url";

// The home motto's Hebrew, and the body text wherever the system has no SF or Segoe (Android; see --font-sans).
// Hebrew subset only, preloaded (a 12 KB variable woff2), so the motto doesn't swap fonts after first paint;
// the Latin subset (30 KB) isn't needed: Latin text falls back to the system face, and the motto's FRC/FTC use Inter.
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew"],
  preload: true,
});

// The home motto's crisp technical Latin (FRC, FTC), beside Heebo's Hebrew.
const inter = Inter({
  variable: "--font-tech",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const SITE_NAME = "COTS-IL";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "ציוד FRC ו-FTC מכל הספקים בהזמנה אחת, במחירים בשקלים לפי שער בנק ישראל",
  openGraph: { siteName: SITE_NAME, locale: "he_IL", type: "website" },
  // Installed from Safari, the app opens full screen with its own name and icon.
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  // Light only (docs/REDESIGN.md, "Visual language"): the top of the page's ice-blue fade.
  themeColor: "#020416",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Supplier photos come from these two CDNs: open the connections while the HTML is still being read.
  preconnect("https://cdn.shopify.com");
  preconnect("https://cdn11.bigcommerce.com");
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {/* Before hydration, so the browser's install prompt isn't missed (src/components/install-app.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
        <a href="#main" className="skip-link">
          דילוג לתוכן
        </a>
        {/* The admin's business facts for the cart sheet and product page (S16a), cached under the `settings` tag. */}
        <SiteFactsProvider>
          <AnnouncementBanner />
          <SiteHeader />
          <main id="main" tabIndex={-1} className="mx-auto outline-none w-full max-w-[1200px] flex-1 px-6 pt-8 pb-16 md:px-12">{children}</main>
          {/* Reads the path, so it waits in Suspense (cacheComponents). */}
          <Suspense>
            <FooterGate>
              <SiteFooter />
              <CartPill />
            </FooterGate>
          </Suspense>
        </SiteFactsProvider>
        <Toaster />
        {/* Real-user Core Web Vitals on Vercel. Reads the route, so it waits in Suspense. */}
        <Suspense>
          <SpeedInsights />
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
