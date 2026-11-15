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
import { ThemeWelcome } from "@/components/theme-welcome";
import { THEME_COLOR, THEME_SCRIPT } from "@/domain/theme";
import "./globals.css";
import { getSettings } from "@/lib/settings";
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

/** The description is the admin's tagline (תוכן האתר). */
export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getSettings();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
    description: content.tagline,
    openGraph: { siteName: SITE_NAME, locale: "he_IL", type: "website" },
    // Installed from Safari, the app opens full screen with its own name and icon.
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
    icons: { apple: "/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  // The browser's chrome in each theme's canvas (theme-store.ts keeps it in step with a choice).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Supplier photos come from these two CDNs: open the connections while the HTML is still being read.
  preconnect("https://cdn.shopify.com");
  preconnect("https://cdn11.bigcommerce.com");
  return (
    // The theme script sets data-theme on <html> before React hydrates it (hence suppressHydrationWarning).
    <html lang="he" dir="rtl" suppressHydrationWarning className={`${heebo.variable} ${inter.variable} h-full antialiased`}>
      <head>
        {/* The saved light/dark choice, before the first paint (src/domain/theme.ts). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
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
        <ThemeWelcome />
        {/* Real-user Core Web Vitals on Vercel. Reads the route, so it waits in Suspense. */}
        <Suspense>
          <SpeedInsights />
          <Analytics />
        </Suspense>
      </body>
    </html>
  );
}
