"use client";

import { Copy, MessageCircle } from "lucide-react";
import { showToast } from "@/components/toast";

export type MentorLink = { userId: string; name: string; url: string; whatsappUrl: string };

/** For each mentor: the quote in WhatsApp, ready to send, or the approval link to copy. */
export function ApproveLinks({ mentors }: { mentors: MentorLink[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {mentors.map((m) => (
        <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">{m.name}</span>
          <span className="flex gap-2">
            <a
              href={m.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center gap-2 rounded-full bg-success px-4 text-sm font-medium text-white"
            >
              <MessageCircle size={16} aria-hidden /> וואטסאפ
            </a>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(m.url).then(() => showToast("הקישור לאישור הועתק"))}
              className="flex min-h-11 items-center gap-2 rounded-full bg-subtle px-4 text-sm"
            >
              <Copy size={16} aria-hidden /> העתקת קישור
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
