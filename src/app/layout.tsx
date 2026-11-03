import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "פורטל רכש FIRST",
  description: "הזמנת ציוד FRC ו-FTC מספקים בינלאומיים",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Suspense fallback={<div className="h-14 border-b border-line bg-surface" />}>
          <SiteHeader />
        </Suspense>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
