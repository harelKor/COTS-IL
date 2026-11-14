import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { contactButtons, type ContactButton } from "@/domain/site-nav";
import type { Business } from "@/domain/settings";
import { Ltr } from "./ltr";

const ICONS: Record<ContactButton["key"], ReactNode> = {
  whatsapp: <MessageCircle size={22} strokeWidth={1.75} aria-hidden className="text-success" />,
  email: <Mail size={22} strokeWidth={1.75} aria-hidden className="text-brand" />,
  phone: <Phone size={22} strokeWidth={1.75} aria-hidden className="text-brand" />,
  address: <MapPin size={22} strokeWidth={1.75} aria-hidden className="text-brand" />,
};

/**
 * The top of /contact: one tappable card per way to reach the business, only for the fields that
 * are filled in. The pickup address opens a map; its hours sit under it. Renders nothing while
 * there's nothing to show.
 */
export function ContactButtons({ business }: { business: Pick<Business, "email" | "phone" | "whatsapp" | "pickupAddress" | "pickupHours"> }) {
  const buttons = contactButtons(business);
  if (buttons.length === 0) return null;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {buttons.map((b) => (
        <li key={b.key} className="min-w-0">
          <a
            href={b.href}
            {...(b.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="card-surface flex min-h-14 items-center gap-3 rounded-card p-4 transition-colors hover:border-brand/40"
          >
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle">
              {ICONS[b.key]}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-caption text-muted">{b.label}</span>
              <span className="break-words font-medium text-foreground">{b.ltr ? <Ltr>{b.value}</Ltr> : b.value}</span>
              {b.key === "address" && business.pickupHours && <span className="text-caption text-muted">{business.pickupHours}</span>}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
