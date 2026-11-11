import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { CartPill } from "@/components/cart-pill";
import { CAPTURE_INSTALL_PROMPT } from "@/lib/install-prompt";
import { SiteFooter } from "@/components/site-footer";
import { FooterGate } from "@/components/footer-gate";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/toast";
import "./globals.css";

// Only the fallback: Apple devices get SF and Windows gets Segoe (see --font-sans).
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  preload: false,
});

const SITE_NAME = "COTS-IL";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://cots-il.vercel.app"),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "ציוד FRC ו-FTC מכל הספקים בהזמנה אחת, במחירים בשקלים לפי שער בנק ישראל",
  openGraph: { siteName: SITE_NAME, locale: "he_IL", type: "website" },
  // Installed from Safari, the app opens full screen with its own name and icon.
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  // Light only (docs/REDESIGN.md, "Visual language"): the top of the page's ice-blue fade.
  themeColor: "#EBF3FF",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {/* Before hydration, so the browser's install prompt isn't missed (src/components/install-app.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
        <a href="#main" className="skip-link">
          דילוג לתוכן
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="mx-auto outline-none w-full max-w-[1200px] flex-1 px-6 pt-8 pb-16 md:px-12">{children}</main>
        {/* Reads the path, so it waits in Suspense (cacheComponents). */}
        <Suspense>
          <FooterGate>
            <SiteFooter />
            <CartPill />
          </FooterGate>
        </Suspense>
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
