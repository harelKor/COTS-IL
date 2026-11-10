"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The site footer and the cart pill are for teams: admin pages show neither (S10A). */
export function FooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return children;
}
