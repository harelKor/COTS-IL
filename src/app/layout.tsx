import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import { CartPill } from "@/components/cart-pill";
import { SiteHeader } from "@/components/site-header";
import { Toaster } from "@/components/toast";
import "./globals.css";

// Only the fallback: Apple devices get SF and Windows gets Segoe (see --font-sans).
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

const SITE_NAME = "COTS-IL";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://cots-il.vercel.app"),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "ציוד FRC ו-FTC מכל הספקים בהזמנה אחת, במחירים בשקלים כולל מע״מ",
  openGraph: { siteName: SITE_NAME, locale: "he_IL", type: "website" },
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
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 pt-8 pb-28 md:px-12">{children}</main>
        <CartPill />
        <Toaster />
      </body>
    </html>
  );
}
