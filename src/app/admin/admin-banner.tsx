import Link from "next/link";
import { ChevronDown, ClipboardCheck, TriangleAlert } from "lucide-react";
import { goLiveChecklist } from "@/domain/go-live";
import { emailConfig } from "@/domain/notifications";
import { requireAdmin } from "@/lib/auth";
import { getFacets } from "@/lib/catalog";
import { getHealth } from "@/lib/health";
import { getBusiness } from "@/lib/settings";
import { HealthList } from "./health-list";

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

/**
 * The banner on every /admin page (the admin layout): the health list's red and yellow lines
 * (src/domain/health.ts, M1) and the go-live checklist (T1: what the site still lacks, a way to
 * reach the business, its name, lead times, payment terms, outgoing email). Each line links to
 * where it's fixed. Open while something is red; otherwise one summary line that opens. Gone
 * once everything is fine.
 */
export async function AdminBanner() {
  await requireAdmin();
  const [{ checks }, business, { suppliers }] = await Promise.all([getHealth(), getBusiness(), getFacets()]);
  const goLive = goLiveChecklist({
    business,
    supplierCodes: suppliers.map((s) => s.code),
    emailOn: emailConfig(process.env) !== null,
  });
  // Email off is on the go-live list already.
  const problems = checks.filter((c) => c.level !== "ok" && !(c.key === "email" && goLive.some((i) => i.key === "email")));
  if (problems.length === 0 && goLive.length === 0) return null;

  const red = problems.filter((c) => c.level === "red").length;
  const yellow = problems.length - red;
  const parts = [
    red > 0 ? count(red, "תקלה אחת", "תקלות") : null,
    yellow > 0 ? count(yellow, "דבר אחד לבדוק", "דברים לבדוק") : null,
    goLive.length > 0 ? `${count(goLive.length, "פרט אחד", "פרטים")} חסרים לפני שפותחים לקבוצות` : null,
  ].filter(Boolean);
  const Icon = problems.length > 0 ? TriangleAlert : ClipboardCheck;

  return (
    <section aria-label="מצב האתר" className={`card-surface mb-6 rounded-card border ${red > 0 ? "border-danger/50" : "border-warning/40"}`}>
      <details open={red > 0} className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-5 py-3 [&::-webkit-details-marker]:hidden">
          <Icon size={20} strokeWidth={1.75} aria-hidden className={red > 0 ? "shrink-0 text-danger" : "shrink-0 text-warning"} />
          <span className="flex-1 font-semibold">{parts.join(", ")}</span>
          <ChevronDown size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="flex flex-col gap-4 px-5 pb-5">
          {problems.length > 0 && (
            <div className="flex flex-col gap-1">
              <HealthList checks={problems} />
              <Link href="/admin/settings/system#health" className="flex min-h-11 items-center text-callout text-brand hover:underline">
                כל הבדיקות בהגדרות › מערכת
              </Link>
            </div>
          )}
          {goLive.length > 0 && (
            <div className="flex flex-col gap-1">
              <h2 className="text-callout font-semibold">לפני שפותחים לקבוצות</h2>
              <p className="text-caption text-muted">עד שימלאו, חלק מהעמודים באתר חסרים או מסתירים משפטים. כל שורה מובילה למקום שבו ממלאים אותה.</p>
              <ul className="flex flex-col divide-y divide-line">
                {goLive.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="flex min-h-11 flex-col gap-0.5 py-2 hover:text-brand sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-caption text-muted">{item.why}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
