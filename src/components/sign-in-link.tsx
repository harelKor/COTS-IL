"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The header's "כניסה": comes back to the page it was tapped on. */
export function SignInLink() {
  const pathname = usePathname();
  const next = pathname && pathname !== "/" && !pathname.startsWith("/login") ? `?next=${encodeURIComponent(pathname)}` : "";
  return (
    <Link href={`/login${next}`} className="flex h-11 shrink-0 items-center px-2 text-callout text-brand hover:underline">
      כניסה
    </Link>
  );
}
