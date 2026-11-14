import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { goLiveChecklist } from "@/domain/go-live";
import { emailConfig } from "@/domain/notifications";
import { requireAdmin } from "@/lib/auth";
import { getFacets } from "@/lib/catalog";
import { getBusiness } from "@/lib/settings";

/**
 * The go-live checklist: what the site still lacks (a way to reach the business, its name, lead
 * times, payment terms, outgoing email), each linking to the page that fills it in. Gone once
 * everything is set.
 */
export async function GoLiveBanner() {
  await requireAdmin();
  const [business, { suppliers }] = await Promise.all([getBusiness(), getFacets()]);
  const items = goLiveChecklist({
    business,
    supplierCodes: suppliers.map((s) => s.code),
    emailOn: emailConfig(process.env) !== null,
  });
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="go-live-title" className="card-surface mb-6 flex flex-col gap-3 rounded-card border border-warning/40 p-5">
      <div className="flex flex-col gap-1">
        <h2 id="go-live-title" className="flex items-center gap-2 text-section font-semibold">
          <ClipboardCheck size={20} strokeWidth={1.75} aria-hidden className="text-warning" />
          לפני שפותחים לקבוצות: עוד {items.length === 1 ? "דבר אחד חסר" : `${items.length} דברים חסרים`}
        </h2>
        <p className="text-caption text-muted">עד שימלאו, חלק מהעמודים באתר חסרים או מסתירים משפטים. כל שורה מובילה למקום שבו ממלאים אותה.</p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="flex min-h-11 flex-col gap-0.5 py-2 hover:text-brand sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <span className="font-medium">{item.label}</span>
              <span className="text-caption text-muted">{item.why}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
