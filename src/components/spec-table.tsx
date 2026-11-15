"use client";

import { useSyncExternalStore } from "react";
import { specRows, type SpecRow, type SpecVariant } from "@/domain/families/spec-rows";
import { Ltr } from "./ltr";

type Spec = { key: string; value: string };
type Left = { key: string; variants: SpecVariant[] };

/** What the picker's choice so far leaves, per family: the spec table below it follows it. */
const left = new Map<string, Left>();
const listeners = new Set<() => void>();

/** Called by the picker on every render; tells the table only when the variants left change. */
export function publishChoice(familyId: string, variants: (SpecVariant & { id: string })[]) {
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

const hasHebrew = (text: string) => /[֐-׿]/.test(text);

/**
 * The page's one spec table. The server renders it for every variant (summaries: "4
 * אפשרויות", "30t – 300t"); in the browser it follows the choice, so a picked bore shows
 * as the bore. Fixed specs from the supplier's description always show.
 */
export function SpecTable({ familyId, optionKeys, fixed, rows }: { familyId: string; optionKeys: string[]; fixed: Spec[]; rows: SpecRow[] }) {
  const choice = useSyncExternalStore(subscribe, () => left.get(familyId), none);
  const shown = choice ? specRows(optionKeys, choice.variants, fixed) : rows;
  if (shown.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-section font-semibold">מפרט</h2>
      <dl className="divide-y divide-line rounded-card bg-surface text-callout">
        {shown.map((s) => (
          <div key={s.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-3">
            <dt className="text-muted">{hasHebrew(s.label) ? s.label : <Ltr>{s.label}</Ltr>}</dt>
            <dd className="text-end">
              {/* About three lines at most; the whole value is in the tooltip. */}
              <span title={s.value} className={`line-clamp-3 ${s.summary ? "text-muted" : ""}`}>
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
