"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { showToast } from "@/components/toast";
import { formatIls, priceIls, resolveMarkup, type PriceContext } from "@/domain/pricing";
import { ROUND_STEPS } from "@/domain/settings";
import { clearRateOverride, removeRule, restoreRule, savePricing } from "../actions";
import { SettingsForm } from "../settings-form";

export type Sample = { id: string; title: string; supplierName: string; supplierId: string; categoryId: string | null; priceUsd: string; markup: string | null };
export type Rule = { id: string; scope: "supplier" | "category"; targetId: string; name: string; multiplier: number };

/** The global multiplier, manual rate, rounding and minimum, with the 5 sample parts priced as typed. */
export function PricingForm({
  current,
  boiRate,
  rateDate,
  manualRate,
  vatRate,
  rules,
  samples,
}: {
  current: PriceContext;
  boiRate: number;
  rateDate: string;
  manualRate: number | null;
  /** pricing.vatRate, a fraction (0.18). */
  vatRate: number;
  rules: Rule[];
  samples: Sample[];
}) {
  const [markup, setMarkup] = useState(String(current.markup));
  const [rate, setRate] = useState(manualRate ? String(manualRate) : "");
  const [roundTo, setRoundTo] = useState(String(current.roundTo));
  const [minIls, setMinIls] = useState(current.minIls ? String(current.minIls) : "");
  const [clearing, startClear] = useTransition();

  const nextMarkup = Number(markup) >= 1 && Number(markup) <= 5 ? Number(markup) : current.markup;
  const nextRate = rate === "" ? boiRate : Number(rate) >= 1 && Number(rate) <= 10 ? Number(rate) : current.rate;
  const next: PriceContext = { rate: nextRate, markup: nextMarkup, roundTo: Number(roundTo), minIls: minIls === "" ? null : Math.max(1, Math.round(Number(minIls)) || 1) };
  const ruleSet = {
    global: nextMarkup,
    bySupplier: new Map(rules.filter((r) => r.scope === "supplier").map((r) => [r.targetId, r.multiplier])),
    byCategory: new Map(rules.filter((r) => r.scope === "category").map((r) => [r.targetId, r.multiplier])),
  };

  return (
    <SettingsForm action={savePricing} label="שמירה ועדכון המחירים" pendingLabel="מעדכן את המחירים בקטלוג…">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="מקדם כללי" name="markup" hint="מחיר בש״ח = מחיר הספק בדולרים × השער × המקדם, כולל מע״מ. כדי לשמור על הרווח של 1.6 לפני מע״מ: בערך 1.89.">
          <Input name="markup" type="number" min={1} max={5} step={0.01} inputMode="decimal" dir="ltr" required value={markup} onChange={(e) => setMarkup(e.target.value)} />
        </Field>
        <Field
          label="שער דולר ידני"
          name="rate"
          hint={`ריק = השער היציג של בנק ישראל (${boiRate} מ-${rateDate.split("-").reverse().join("/")}). שער ידני נשאר עד שמנקים אותו.`}
        >
          <Input name="rate" type="number" min={1} max={10} step={0.001} inputMode="decimal" dir="ltr" placeholder={String(boiRate)} value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="עיגול" name="roundTo">
          <Select name="roundTo" value={roundTo} onChange={(e) => setRoundTo(e.target.value)}>
            {ROUND_STEPS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "לשקל השלם" : `ל-${n} ש״ח הקרובים`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="מע״מ (%)" name="vat" hint="המחירים באתר כוללים מע״מ. הצעות מחיר מציגות ״מתוכו מע״מ״ לפי השיעור ביום השליחה; הצעות שכבר נשלחו לא משתנות.">
          <Input name="vat" type="number" min={0} max={50} step={0.01} inputMode="decimal" dir="ltr" required defaultValue={Number((vatRate * 100).toFixed(2))} />
        </Field>
        <Field label="מחיר מינימלי (ש״ח)" name="minIls" hint="ריק = בלי מינימום. אף חלק לא יתומחר מתחת לסכום הזה.">
          <Input name="minIls" type="number" min={1} max={10000} inputMode="numeric" dir="ltr" value={minIls} onChange={(e) => setMinIls(e.target.value)} />
        </Field>
      </div>
      {manualRate !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-soft px-3 py-2 text-callout">
          <span>
            שער ידני פעיל: <Ltr>{manualRate}</Ltr>
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={clearing}
            onClick={() =>
              startClear(async () => {
                const r = await clearRateOverride();
                setRate("");
                showToast(r.ok ? (r.message ?? "נוקה") : r.error, r.ok ? "default" : "error");
              })
            }
          >
            {clearing ? "מעדכן…" : "ניקוי, חזרה לשער בנק ישראל"}
          </Button>
        </div>
      )}

      <section aria-labelledby="preview-title" className="flex flex-col gap-2">
        <h2 id="preview-title" className="text-section font-semibold">
          תצוגה מקדימה
        </h2>
        <ul className="divide-y divide-line card-surface">
          {samples.map((s) => {
            const now = priceIls(s.priceUsd, current, s.markup);
            const resolved = resolveMarkup(ruleSet, { supplierId: s.supplierId, categoryId: s.categoryId });
            const after = priceIls(s.priceUsd, next, resolved.kind === "markup" ? resolved.markup : null);
            const changed = now !== after;
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-callout">
                <span className="min-w-0 flex-1">
                  <Ltr className="font-medium">{s.title}</Ltr>
                  <span className="block text-caption text-muted">
                    <Ltr>{s.supplierName}</Ltr>, <Ltr>${Number(s.priceUsd).toFixed(2)}</Ltr>
                  </span>
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  {changed && now !== null && <span className="text-muted line-through">{formatIls(now)}</span>}
                  <span className={changed ? "font-semibold text-brand-strong" : ""}>{after === null ? "ללא מחיר" : formatIls(after)}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-caption text-muted">הזמנות והצעות מחיר שכבר נשלחו שומרות את המחיר שלהן.</p>
      </section>
    </SettingsForm>
  );
}

/** One rule with "הסרה" and an Undo toast. */
export function RemoveRuleButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      aria-label={`הסרת המקדם של ${name}`}
      onClick={() =>
        start(async () => {
          const removed = await removeRule(id);
          if (!removed) return showToast("המקדם כבר הוסר", "error");
          showToast("המקדם הוסר והמחירים עודכנו", "default", { label: "ביטול", run: () => void restoreRule(removed) });
        })
      }
    >
      {pending ? "מסיר…" : "הסרה"}
    </Button>
  );
}
