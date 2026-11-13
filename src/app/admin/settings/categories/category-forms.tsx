"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { Button, fieldClass, StatusTag } from "@/components/form";
import { showToast } from "@/components/toast";
import { moveId, type CategoryGroup } from "@/domain/category-groups";
import { shopifyImage } from "@/lib/images";
import { moveCategory, restoreCategories, saveCategory, saveGroups, type CategoryResult, type CategorySnapshot } from "./actions";

const iconButton = "flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-brand disabled:opacity-40";

function undoToast(r: CategoryResult) {
  if (!r.ok) return showToast(r.error, "error");
  const before: CategorySnapshot[] = r.before;
  showToast(r.message, "default", {
    label: "ביטול",
    run: () => void restoreCategories(before).then((u) => showToast(u.ok ? (u.message ?? "בוטל") : u.error, u.ok ? "default" : "error")),
  });
}

/** The groups' names and order; saved together, with Undo. */
export function GroupsEditor({ groups }: { groups: CategoryGroup[] }) {
  const [list, setList] = useState<{ key: string; id: string | null; name: string }[]>(() => groups.map((g) => ({ key: g.id, id: g.id, name: g.name })));
  const [pending, start] = useTransition();
  const base = useId();
  const keys = list.map((g) => g.key);
  const move = (key: string, by: -1 | 1) => setList((l) => moveId(l.map((g) => g.key), key, by).map((k) => l.find((g) => g.key === k)!));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveGroups(list.map((g) => ({ id: g.id, name: g.name })));
          if (!r.ok) return showToast(r.error, "error");
          const before = r.before;
          showToast(r.message, "default", { label: "ביטול", run: () => void saveGroups(before).then(() => location.reload()) });
        });
      }}
    >
      <ol className="flex flex-col gap-2">
        {list.map((g, i) => (
          <li key={g.key} className="flex items-center gap-1">
            <label htmlFor={`${base}-${g.key}`} className="sr-only">
              שם הקבוצה {i + 1}
            </label>
            <input
              id={`${base}-${g.key}`}
              value={g.name}
              maxLength={40}
              required
              onChange={(e) => setList((l) => l.map((x) => (x.key === g.key ? { ...x, name: e.target.value } : x)))}
              className={`${fieldClass} min-w-0 flex-1`}
            />
            <button type="button" className={iconButton} disabled={i === 0} onClick={() => move(g.key, -1)} aria-label={`הזזת ${g.name} למעלה`}>
              <ArrowUp size={20} strokeWidth={1.75} />
            </button>
            <button type="button" className={iconButton} disabled={i === keys.length - 1} onClick={() => move(g.key, 1)} aria-label={`הזזת ${g.name} למטה`}>
              <ArrowDown size={20} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className={iconButton}
              disabled={list.length <= 1}
              onClick={() => setList((l) => l.filter((x) => x.key !== g.key))}
              aria-label={`מחיקת הקבוצה ${g.name}`}
            >
              <Trash2 size={20} strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="ghost" disabled={list.length >= 12} onClick={() => setList((l) => [...l, { key: `new-${l.length}-${Date.now()}`, id: null, name: "" }])}>
          <Plus size={20} strokeWidth={1.75} aria-hidden />
          קבוצה חדשה
        </Button>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "שומר…" : "שמירת הקבוצות"}
        </Button>
      </div>
    </form>
  );
}

type Row = { id: string; slug: string; name: string; groupId: string; hidden: boolean; homeImage: string | null; images: string[]; count: number };

/** One category: name, group, hidden, home photo; up and down move it at once, with Undo. */
export function CategoryRow({ category: c, groups, choices, first, last }: { category: Row; groups: CategoryGroup[]; choices: string[]; first: boolean; last: boolean }) {
  const [pending, start] = useTransition();
  const [photo, setPhoto] = useState(c.homeImage ?? "");
  const base = useId();
  const options = c.homeImage && !choices.includes(c.homeImage) ? [c.homeImage, ...choices] : choices;

  return (
    <li className="card-surface flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-body font-semibold">{c.name}</span>
          <StatusTag>{c.count.toLocaleString("he-IL")} מוצרים</StatusTag>
          {c.hidden && <StatusTag tone="warning">מוסתרת</StatusTag>}
        </div>
        <div className="flex">
          <button type="button" className={iconButton} disabled={first || pending} onClick={() => start(async () => undoToast(await moveCategory(c.id, -1)))} aria-label={`הזזת ${c.name} למעלה`}>
            <ArrowUp size={20} strokeWidth={1.75} />
          </button>
          <button type="button" className={iconButton} disabled={last || pending} onClick={() => start(async () => undoToast(await moveCategory(c.id, 1)))} aria-label={`הזזת ${c.name} למטה`}>
            <ArrowDown size={20} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <form
        className="flex flex-col gap-3"
        aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          start(async () => undoToast(await saveCategory(form)));
        }}
      >
        <input type="hidden" name="id" value={c.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${base}-name`} className="text-callout font-medium">
              שם
            </label>
            <input id={`${base}-name`} name="name" defaultValue={c.name} required maxLength={60} className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${base}-group`} className="text-callout font-medium">
              קבוצה
            </label>
            <select id={`${base}-group`} name="groupId" defaultValue={c.groupId} className={fieldClass}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-callout font-medium">תמונה בדף הבית</legend>
          <input type="hidden" name="homeImage" value={photo} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={photo === ""}
              onClick={() => setPhoto("")}
              className={`flex size-14 items-center justify-center rounded-xl border text-caption ${photo === "" ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-muted"}`}
            >
              אוטומטי
            </button>
            {options.map((src) => (
              <button
                key={src}
                type="button"
                aria-pressed={photo === src}
                aria-label="בחירת התמונה"
                onClick={() => setPhoto(src)}
                className={`tile-fade flex size-14 items-center justify-center overflow-hidden rounded-xl border-2 p-1 ${photo === src ? "border-brand" : "border-transparent"}`}
              >
                {/* Hot-linked from the supplier's CDN, like every catalog photo. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img {...shopifyImage(src, 56)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
              </button>
            ))}
          </div>
          <label htmlFor={`${base}-photo`} className="text-caption text-muted">
            או קישור לתמונה (https)
          </label>
          <input id={`${base}-photo`} type="url" dir="ltr" value={photo} onChange={(e) => setPhoto(e.target.value.trim())} className={fieldClass} placeholder="https://" />
        </fieldset>
        <label className="flex min-h-11 items-center gap-3 text-callout">
          <input type="checkbox" name="hidden" defaultChecked={c.hidden} className="size-5 accent-brand" />
          הסתרה מרשימות הקטגוריות
        </label>
        <div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "שומר…" : "שמירה"}
          </Button>
        </div>
      </form>
    </li>
  );
}
