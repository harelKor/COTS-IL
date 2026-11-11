import { MessageCircle } from "lucide-react";
import { whatsappHref } from "@/lib/business";

/** "שאלה? וואטסאפ": a person on the other end. Renders nothing while there's no number. */
export function WhatsAppLink({ text }: { text?: string }) {
  const href = whatsappHref(text);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex self-start h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-medium text-foreground shadow-card transition-colors hover:border-brand/40 hover:text-brand"
    >
      <MessageCircle size={20} strokeWidth={1.75} aria-hidden className="text-success" />
      שאלה? וואטסאפ
    </a>
  );
}
