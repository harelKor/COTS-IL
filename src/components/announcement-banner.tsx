"use client";

import { Megaphone } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { bannerShows } from "@/domain/content";
import { useSiteFacts } from "./site-facts";

const noSubscribe = () => () => {};
/** Today in Israel, YYYY-MM-DD. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

/**
 * The admin's announcement (תוכן האתר) above the header. Its end date is checked in the
 * browser, so the cached page needn't be rebuilt the day after; a banner with an end date
 * appears once the page hydrates.
 */
export function AnnouncementBanner() {
  const { banner } = useSiteFacts();
  const day = useSyncExternalStore(noSubscribe, today, () => null);
  if (!banner.enabled || !banner.text) return null;
  if (banner.endsOn && (day === null || !bannerShows(banner, day))) return null;
  const body = (
    <>
      <Megaphone size={20} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span>{banner.text}</span>
    </>
  );
  const cls = "mx-auto flex min-h-11 max-w-[1200px] items-center justify-center gap-2 px-6 py-2 text-center text-callout font-medium md:px-12";
  return (
    <div role="region" aria-label="הודעה" className="bg-brand-soft text-brand-strong">
      {banner.href ? (
        banner.href.startsWith("/") ? (
          <Link href={banner.href} className={`${cls} hover:underline`}>
            {body}
          </Link>
        ) : (
          <a href={banner.href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:underline`}>
            {body}
          </a>
        )
      ) : (
        <p className={cls}>{body}</p>
      )}
    </div>
  );
}
