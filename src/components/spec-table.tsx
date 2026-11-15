"use client";

import { useSyncExternalStore } from "react";
import { ListChecks } from "lucide-react";
import { specRows, type SpecRow, type SpecVariant } from "@/domain/families/spec-rows";
import { Ltr } from "./ltr";
import { SectionHeading } from "./section-heading";

type Spec = { key: string; value: string };
/** A variant as the picker publishes it: its specs, and where the vendor sells it. */
export type ChoiceVariant = SpecVariant & { id: string; supplierCode?: string; productUrl?: string };
type Left = { key: string; variants: ChoiceVariant[] };

/** What the picker's choice so far leaves, per family: the spec table and the doc tiles follow it. */
const left = new Map<string, Left>();
const listeners = new Set<() => void>();

/** Called by the picker on every render; tells the table only when the variants left change. */
export function publishChoice(familyId: string, variants: ChoiceVariant[]) {
  const key = variants.map((v) => v.id).join(",");
  if (left.get(familyId)?.key === key) return;
  left.set(familyId, { key, variants });
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const none = () => undefined;

/** The variants the choice so far leaves, or undefined before the picker has said (and while prerendering). */
export function useChoice(familyId: string): ChoiceVariant[] | undefined {
  return useSyncExternalStore(subscribe, () => left.get(familyId), none)?.variants;
}

const hasHebrew = (text: string) => /[֐-׿]/.test(text);

/**
 * The page's one spec table, under the buy box (PP4). The server renders it for every variant
 * (summaries: "4 אפשרויות", "30t – 300t"); in the browser it follows the choice, so a picked bore
 * shows as the bore. Fixed specs from the supplier's description always show. It sits on the page
 * itself: a heading, a band in the vendor's colours and hairline rows, no box around it.
 */
export function SpecTable({ familyId, optionKeys, fixed, rows }: { familyId: string; optionKeys: string[]; fixed: Spec[]; rows: SpecRow[] }) {
  const choice = useChoice(familyId);
  const shown = choice ? specRows(optionKeys, choice, fixed) : rows;
  if (shown.length === 0) return null;
  return (
    <section data-jump="מפרט" className="pdp-section flex flex-col gap-4">
      <SectionHeading icon={<ListChecks size={20} strokeWidth={1.75} />}>מפרט</SectionHeading>
      <dl className="pdp-spec flex flex-col">
        {shown.map((s) => (
          <div key={s.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-4 border-b border-line/70 py-3 last:border-b-0">
            <dt className="text-callout text-muted">{hasHebrew(s.label) ? s.label : <Ltr>{s.label}</Ltr>}</dt>
            <dd className="text-end">
              {/* About three lines at most; the whole value is in the tooltip. */}
              <span title={s.value} className={`line-clamp-3 text-body ${s.summary ? "text-muted" : "font-medium text-foreground"}`}>
                {hasHebrew(s.value) ? s.value : <Ltr>{s.value}</Ltr>}
              </span>
              {s.sub && <span className="block text-caption text-muted">{s.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
