"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2, Upload, X } from "lucide-react";
import { Button, buttonClass, Field, fieldClass, Input, Select, StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { showToast } from "@/components/toast";
import { htmlToText } from "@/domain/part-editor";
import { formatIls } from "@/domain/pricing";
import { familyHref } from "@/lib/catalog-links";
import type { EditorPart } from "@/lib/product-admin";
import { removePart, revertPart, savePart, undoPartChange, uploadPartPhoto, type PartResult } from "./actions";

type Row = { key: string; id: string | null; values: string[]; sku: string; priceUsd: string; fixedIls: string; hidden: boolean; remove: boolean; storePriceUsd: string | null; storeSku: string | null; priceIls: number | null };

let nextKey = 1;

function rowsOf(part: EditorPart | null, names: string[]): Row[] {
  if (!part) return [{ key: `n${nextKey++}`, id: null, values: names.map(() => ""), sku: "", priceUsd: "", fixedIls: "", hidden: false, remove: false, storePriceUsd: null, storeSku: null, priceIls: null }];
  return part.variants.map((v) => ({
    key: v.id,
    id: v.id,
    values: names.map((n) => v.options.find((o) => o.name === n)?.value ?? ""),
    sku: v.sku ?? "",
    priceUsd: v.priceUsd ?? "",
    fixedIls: v.fixedIls ? String(Number(v.fixedIls)) : "",
    hidden: v.hidden,
    remove: false,
    storePriceUsd: v.storePriceUsd,
    storeSku: v.storeSku,
    priceIls: v.priceIls,
  }));
}

/** Shows the result, with Undo when the action gave one. */
function report(result: PartResult) {
  if (!result.ok) return showToast(result.error, "error");
  const undo = result.undo;
  showToast(
    result.message,
    "default",
    undo
      ? {
          label: "ביטול",
          run: () => void undoPartChange(undo).then((r) => showToast(r.ok ? r.message : r.error, r.ok ? "default" : "error")),
        }
      : undefined,
  );
}

/**
 * The edit window (S16c): a side sheet, full screen on a phone. For a synced part, a field
 * left as the store has it stays the store's, and "חזרה לנתוני הספק" drops every edit.
 */
export function PartSheet({
  part,
  supplier,
  categories,
  closeHref,
}: {
  part: EditorPart | null;
  supplier: { id: string; name: string };
  categories: { id: string; name: string }[];
  closeHref: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const custom = !part || part.source === "custom";
  const [names, setNames] = useState<string[]>(() => (part?.optionNames.length ? part.optionNames : custom ? [""] : []));
  const [rows, setRows] = useState<Row[]>(() => rowsOf(part, part?.optionNames ?? [""]));
  const [images, setImages] = useState<string[]>(part?.images ?? []);
  const [photoUrl, setPhotoUrl] = useState("");
  const [busy, startTransition] = useTransition();

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const close = () => router.push(closeHref, { scroll: false });

  const [state, formAction, pending] = useActionState(async (_: PartResult | null, formData: FormData) => {
    const result = await savePart(null, formData);
    report(result);
    if (result.ok) {
      dialog.current?.close();
      router.refresh();
    }
    return result;
  }, null);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addPhoto = (url: string) => {
    const u = url.trim();
    if (!/^https:\/\//.test(u)) return showToast("כתובת תמונה צריכה להתחיל ב-https://", "error");
    setImages((list) => (list.includes(u) ? list : [...list, u]));
    setPhotoUrl("");
  };
  const move = (i: number, by: number) =>
    setImages((list) => {
      const next = [...list];
      const j = i + by;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const upload = (file: File | undefined) => {
    if (!file) return;
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      const r = await uploadPartPhoto(data);
      if (r.ok) setImages((list) => [...list, r.url]);
      else showToast(r.error, "error");
    });
  };

  const act = (run: () => Promise<PartResult>) =>
    startTransition(async () => {
      const result = await run();
      report(result);
      if (result.ok) {
        dialog.current?.close();
        router.refresh();
      }
    });

  const variantsJson = JSON.stringify(
    rows.map((r) => ({ id: r.id, values: r.values, sku: r.sku, priceUsd: r.priceUsd, fixedIls: r.fixedIls, hidden: r.hidden, remove: r.remove })),
  );
  const changed = part && part.source === "synced" && (part.overridden || part.variants.some((v) => v.overridden));

  return (
    <dialog
      ref={dialog}
      aria-labelledby="part-sheet-title"
      className="sheet sheet-side sheet-wide"
      onClose={close}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      <form action={formAction} className="flex h-full flex-col" aria-busy={pending}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-2">
          <div className="flex min-w-0 flex-col">
            <h2 id="part-sheet-title" className="truncate text-section font-semibold">
              {part ? <Ltr>{part.title}</Ltr> : "הוספת חלק"}
            </h2>
            <p className="text-caption text-muted">
              <Ltr>{supplier.name}</Ltr>
              {part ? (part.source === "custom" ? ", חלק ידני" : ", מהסנכרון: השינויים נשמרים גם אחרי הסנכרון הלילי") : ", חלק ידני"}
            </p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className={buttonClass("ghost", "px-3")} aria-label="סגירה">
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
          <input type="hidden" name="productId" value={part?.id ?? ""} />
          <input type="hidden" name="supplierId" value={supplier.id} />
          <input type="hidden" name="images" value={JSON.stringify(images)} />
          <input type="hidden" name="optionNames" value={JSON.stringify(names)} />
          <input type="hidden" name="variants" value={variantsJson} />

          {changed && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-soft px-3 py-2">
              <span className="text-callout text-brand-strong">בחלק הזה יש שינויים שלכם על נתוני הספק</span>
              <button type="button" disabled={busy} onClick={() => act(() => revertPart(part.id))} className={buttonClass("ghost")}>
                חזרה לנתוני הספק
              </button>
            </div>
          )}

          <Field label="שם" name="title" hint={part && part.source === "synced" && part.title !== part.storeTitle ? `אצל הספק: ${part.storeTitle}` : undefined}>
            <Input name="title" defaultValue={part?.title ?? ""} required maxLength={200} dir="auto" />
          </Field>

          <Field label="תיאור" name="description" hint="טקסט פשוט. שורה ריקה מתחילה פסקה חדשה.">
            <textarea id="description" name="description" defaultValue={htmlToText(part?.descriptionHtml ?? null)} rows={5} dir="auto" className={`${fieldClass} h-auto py-2`} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="קטגוריה" name="categoryId">
              <Select name="categoryId" defaultValue={part?.categoryId ?? ""}>
                <option value="">ללא קטגוריה</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="זמינות" name="availability">
              <Select name="availability" defaultValue={part?.available === true ? "yes" : part?.available === false ? "no" : "store"}>
                <option value="store">{custom ? "לא ידועה" : "כמו אצל הספק"}</option>
                <option value="yes">במלאי</option>
                <option value="no">לא במלאי</option>
              </Select>
            </Field>
          </div>

          {custom && (
            <Field label="קישור לחלק אצל הספק" name="url" hint="לא חובה. בלי קישור, ההזמנה מהספק מקשרת לחנות שלו.">
              <Input name="url" type="url" dir="ltr" defaultValue={part && part.url !== "" ? part.url : ""} placeholder="https://" />
            </Field>
          )}
          {part && !custom && (
            <a href={part.url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 text-callout text-brand hover:underline">
              <ExternalLink size={20} aria-hidden />
              הדף אצל הספק
            </a>
          )}

          {part && (
            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="mb-2 text-callout font-medium">משפחה</legend>
              {part.family ? (
                <p className="text-caption text-muted">
                  בדף המוצר{" "}
                  <a href={familyHref(part.family.slug)} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                    <Ltr>{part.family.title}</Ltr>
                  </a>
                  {part.family.members.length > 0 ? (
                    <>
                      {" "}
                      יחד עם{" "}
                      <Ltr>{part.family.members.map((m) => `${m.title} (${m.supplier})`).join(", ")}</Ltr>
                    </>
                  ) : (
                    ", לבד"
                  )}
                </p>
              ) : (
                <p className="text-caption text-muted">עוד לא במשפחה (מוסתר או בלי גרסאות)</p>
              )}
              <Field label="איחוד עם משפחה" name="mergeWith" hint="קישור לדף המוצר, ה-slug שלו או מק״ט שבו. ריק = לפי השם, כרגיל.">
                <Input name="mergeWith" defaultValue={part.mergeKey ?? ""} dir="ltr" />
              </Field>
              <label className="flex min-h-11 items-center gap-2 text-callout">
                <input type="checkbox" name="alone" defaultChecked={part.alone} className="size-5 accent-brand" />
                הפרדה למשפחה נפרדת (לא מתאחד עם חלקים אחרים)
              </label>
            </fieldset>
          )}

          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="mb-2 text-callout font-medium">תמונות (הראשונה היא הראשית)</legend>
            {images.length === 0 && <p className="text-caption text-muted">אין תמונות</p>}
            <ul className="flex flex-col gap-2">
              {images.map((src, i) => (
                <li key={src} className="flex items-center gap-2 rounded-xl bg-subtle p-1">
                  <div className="tile-fade size-14 shrink-0 overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="size-full object-contain" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-caption text-muted" dir="ltr">
                    {src.replace(/^https:\/\//, "")}
                  </span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="למעלה" className={buttonClass("ghost", "px-3")}>
                    <ArrowUp size={20} aria-hidden />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="למטה" className={buttonClass("ghost", "px-3")}>
                    <ArrowDown size={20} aria-hidden />
                  </button>
                  <button type="button" onClick={() => setImages((l) => l.filter((u) => u !== src))} aria-label="הסרת התמונה" className={buttonClass("ghost", "px-3 text-danger")}>
                    <Trash2 size={20} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <input
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPhoto(photoUrl);
                  }
                }}
                placeholder="https://… כתובת תמונה"
                aria-label="כתובת תמונה"
                dir="ltr"
                className={`${fieldClass} min-w-0 flex-1 basis-48`}
              />
              <button type="button" onClick={() => addPhoto(photoUrl)} className={buttonClass("secondary")}>
                הוספת תמונה
              </button>
              <label className={buttonClass("secondary", "cursor-pointer")}>
                <Upload size={20} aria-hidden />
                העלאה
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
              </label>
            </div>
            {part && !custom && images.join() !== part.storeImages.join() && (
              <button type="button" onClick={() => setImages(part.storeImages)} className={buttonClass("ghost", "self-start")}>
                התמונות של הספק
              </button>
            )}
          </fieldset>

          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="mb-2 text-callout font-medium">גרסאות ומחירים</legend>
            <p className="text-caption text-muted">
              מחיר בדולרים עובר דרך השער והמקדם. מחיר ₪ קבוע מחליף אותם לגמרי. {custom ? "" : "שדה ריק משאיר את נתוני הספק."}
            </p>
            {custom && (
              <div className="flex flex-wrap gap-2">
                {names.map((n, i) => (
                  <input
                    key={i}
                    value={n}
                    onChange={(e) => setNames((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={`שם אפשרות ${i + 1}, למשל Size`}
                    aria-label={`שם אפשרות ${i + 1}`}
                    dir="auto"
                    className={`${fieldClass} min-w-0 flex-1 basis-32`}
                  />
                ))}
                {names.length < 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      setNames((l) => [...l, ""]);
                      setRows((rs) => rs.map((r) => ({ ...r, values: [...r.values, ""] })));
                    }}
                    className={buttonClass("ghost")}
                  >
                    <Plus size={20} aria-hidden />
                    אפשרות
                  </button>
                )}
              </div>
            )}
            <ul className="flex flex-col gap-3">
              {rows.map((r, index) => (
                <li key={r.key} className={`flex flex-col gap-2 rounded-xl border border-line p-3 ${r.remove ? "opacity-50" : ""}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-caption text-muted">גרסה {index + 1}</span>
                    {r.priceIls !== null && <span className="text-caption text-muted">מחיר באתר עכשיו: {formatIls(r.priceIls)}</span>}
                    {r.hidden && <StatusTag tone="warning">מוסתרת</StatusTag>}
                  </div>
                  {names.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {names.map((n, i) => (
                        <input
                          key={i}
                          value={r.values[i] ?? ""}
                          onChange={(e) => update(r.key, { values: names.map((_, j) => (j === i ? e.target.value : (r.values[j] ?? ""))) })}
                          placeholder={n || `אפשרות ${i + 1}`}
                          aria-label={`${n || `אפשרות ${i + 1}`}, גרסה ${index + 1}`}
                          dir="auto"
                          className={`${fieldClass} min-w-0`}
                        />
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <input
                      value={r.sku}
                      onChange={(e) => update(r.key, { sku: e.target.value })}
                      placeholder={r.storeSku ?? "מק״ט"}
                      aria-label={`מק״ט, גרסה ${index + 1}`}
                      dir="ltr"
                      className={`${fieldClass} col-span-2 min-w-0 sm:col-span-1`}
                    />
                    <input
                      value={r.priceUsd}
                      onChange={(e) => update(r.key, { priceUsd: e.target.value })}
                      inputMode="decimal"
                      placeholder={custom ? "$ מחיר ספק" : r.storePriceUsd ? `$${r.storePriceUsd} אצל הספק` : "$"}
                      aria-label={`מחיר בדולרים, גרסה ${index + 1}`}
                      dir="ltr"
                      className={`${fieldClass} min-w-0`}
                    />
                    <input
                      value={r.fixedIls}
                      onChange={(e) => update(r.key, { fixedIls: e.target.value })}
                      inputMode="numeric"
                      placeholder="₪ קבוע"
                      aria-label={`מחיר קבוע בשקלים, גרסה ${index + 1}`}
                      dir="ltr"
                      className={`${fieldClass} min-w-0`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex min-h-11 items-center gap-2 text-callout">
                      <input type="checkbox" checked={r.hidden} onChange={(e) => update(r.key, { hidden: e.target.checked })} className="size-5 accent-brand" />
                      הסתרת הגרסה
                    </label>
                    {custom && rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => (r.id ? update(r.key, { remove: !r.remove }) : setRows((rs) => rs.filter((x) => x.key !== r.key)))}
                        className={buttonClass("ghost", "ms-auto text-danger")}
                      >
                        {r.remove ? "השארה" : "הסרה"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {custom && (
              <button
                type="button"
                onClick={() => setRows((rs) => [...rs, { ...rowsOf(null, names)[0], values: names.map(() => "") }])}
                className={buttonClass("secondary", "self-start")}
              >
                <Plus size={20} aria-hidden />
                גרסה
              </button>
            )}
          </fieldset>

          <label className="flex min-h-11 items-center gap-2 text-callout">
            <input type="checkbox" name="hidden" defaultChecked={part?.hidden ?? false} className="size-5 accent-brand" />
            הסתרת החלק מהאתר
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-3">
          <Button type="submit" disabled={pending || busy}>
            {pending ? "שומר…" : part ? "שמירה" : "הוספת החלק"}
          </Button>
          {part && (
            <Button type="button" variant="danger" disabled={pending || busy} onClick={() => act(() => removePart(part.id))}>
              {custom && part.orderLines === 0 ? "מחיקה" : "הסתרה"}
            </Button>
          )}
          <p role="status" aria-live="polite" className="text-callout text-danger">
            {state && !state.ok ? state.error : ""}
          </p>
        </div>
      </form>
    </dialog>
  );
}
