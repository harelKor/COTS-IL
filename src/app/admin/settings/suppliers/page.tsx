import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/form";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { requireAdmin } from "@/lib/auth";
import { getPricingRules, getSettings } from "@/lib/settings";
import { supplierCards, syncUnavailableReason } from "@/lib/supplier-admin";
import { AddSupplier, SupplierCard } from "./supplier-forms";

export const metadata: Metadata = { title: "הגדרות: ספקים" };
/** Hiding, deleting or a new multiplier regroups the catalog (about 10 s locally). */
export const maxDuration = 60;

async function Suppliers() {
  await requireAdmin();
  const [cards, settings, rules] = await Promise.all([supplierCards(), getSettings(), getPricingRules()]);
  const multipliers = new Map(rules.filter((r) => r.scope === "supplier").map((r) => [r.targetId, r.multiplier]));
  const syncUnavailable = syncUnavailableReason();

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">הוספת ספק</h2>
          <p className="text-caption text-muted">חנות Shopify מסתנכרנת אוטומטית. כל חנות אחרת נשמרת כספק ידני, והחלקים שלה מתווספים ידנית.</p>
        </div>
        <AddSupplier />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-section font-semibold">ספקים ({cards.length})</h2>
        <ul className="grid gap-4 lg:grid-cols-2">
          {cards.map((s) => (
            <SupplierCard
              key={s.id}
              supplier={s}
              lead={settings.business.leadTimes[s.code] ?? null}
              multiplier={multipliers.get(s.id) ?? null}
              globalMarkup={settings.pricing.markup}
              syncUnavailable={syncUnavailable}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function SupplierSettingsPage() {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <Suppliers />
    </Suspense>
  );
}
