"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { matchList } from "@/domain/list-search";
import { Ltr } from "./ltr";
import { fieldClass, SearchField } from "./search-field";

export type ComboOption = {
  value: string;
  label: string;
  /** Muted under the label ("2 שלבים"). */
  sub: string | null;
  /** What a pick of it costs (exact, or "מ-₪28"), or nothing when every row costs the same. */
  price: string | null;
  /** Why it doesn't go with the other choices ("לא זמין עם 1 inch"); it can still be picked (the others clear). */
  clash: string | null;
  selected: boolean;
};

const wide = "(min-width: 768px)";
const subscribe = (on: () => void) => {
  const q = window.matchMedia(wide);
  q.addEventListener("change", on);
  return () => q.removeEventListener("change", on);
};
const isWide = () => window.matchMedia(wide).matches;

/**
 * A large option group (the belt's 54 teeth, the gearbox's 18 ratios) as one searchable field:
 * typing filters the list, each row has its price and a muted "לא זמין" when it clashes.
 * From 768px the list opens under the field; on phones it fills a bottom sheet.
 * An ARIA combobox with a listbox: arrows, Home/End, Enter and Escape.
 */
export function OptionCombobox({
  title,
  labelledBy,
  options,
  onPick,
  fieldRef,
}: {
  title: string;
  /** The group's legend, the field's name. */
  labelledBy: string;
  options: ComboOption[];
  onPick: (value: string) => void;
  /** The field, so "בחרו …" can focus it. */
  fieldRef?: React.Ref<HTMLElement>;
}) {
  const desktop = useSyncExternalStore(subscribe, isWide, () => true);
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const sheet = useRef<HTMLDialogElement>(null);

  const selected = options.find((o) => o.selected);
  const selectedText = selected ? `${selected.label}${selected.sub ? ` (${selected.sub})` : ""}` : "";
  const shown = matchList(options, query, (o) => `${o.label} ${o.sub ?? ""} ${o.value}`);

  function show() {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.selected)));
    setOpen(true);
    if (!desktop) sheet.current?.showModal();
  }

  function hide() {
    setOpen(false);
    setQuery("");
    if (sheet.current?.open) sheet.current.close();
  }

  function choose(o: ComboOption) {
    hide();
    onPick(o.value);
  }

  // Keep the active row in view while the arrows move it.
  useEffect(() => {
    if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const last = shown.length - 1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      setActive((i) => (e.key === "ArrowDown" ? (i >= last ? 0 : i + 1) : i <= 0 ? last : i - 1));
    } else if (open && (e.key === "Home" || e.key === "End")) {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : last);
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      const o = shown[active];
      if (o) choose(o);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      hide();
    }
  }

  const field = `${fieldClass} min-h-12 ps-4 pe-3`;

  const inputProps = (inSheet: boolean) => ({
    ref: inSheet ? undefined : (fieldRef as React.Ref<HTMLInputElement>),
    role: "combobox",
    "aria-labelledby": labelledBy,
    "aria-expanded": open,
    "aria-controls": listId,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": open && shown[active] ? optionId(active) : undefined,
    value: open ? query : selectedText,
    placeholder: open ? selectedText || "חיפוש" : "בחרו או הקלידו לחיפוש",
    onClick: () => !open && show(),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setActive(0);
      if (!open) show();
    },
    onKeyDown,
    onBlur: () => desktop && hide(),
  });

  const input = (inSheet: boolean) => (
    <input
      {...inputProps(inSheet)}
      autoComplete="off"
      spellCheck={false}
      className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-muted"
    />
  );

  const list = (
    <ul id={listId} role="listbox" aria-labelledby={labelledBy} className="flex flex-col gap-0.5 p-1">
      {shown.map((o, i) => (
        <li
          key={o.value}
          id={optionId(i)}
          role="option"
          aria-selected={o.selected}
          aria-disabled={o.clash ? true : undefined}
          title={o.clash ?? undefined}
          data-active={i === active || undefined}
          // Keeps focus in the field, so the list doesn't close before the pick.
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setActive(i)}
          onClick={() => choose(o)}
          className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-1.5 data-[active]:bg-subtle ${
            o.selected ? "bg-brand-soft/60 font-medium" : ""
          }`}
        >
          <span className={`flex min-w-0 flex-col leading-tight ${o.clash ? "text-muted line-through decoration-1" : ""}`}>
            <Ltr>{o.label}</Ltr>
            {o.sub && <span className="text-caption text-muted no-underline">{o.sub}</span>}
          </span>
          <span className="shrink-0 text-caption text-muted">
            {o.clash ? (
              <>
                לא זמין<span className="sr-only">: {o.clash}</span>
              </>
            ) : (
              o.price
            )}
          </span>
        </li>
      ))}
      {shown.length === 0 && (
        <li role="presentation" className="px-3 py-3 text-caption text-muted">
          אין התאמה ל-<Ltr>{query}</Ltr>
        </li>
      )}
    </ul>
  );

  if (desktop) {
    return (
      <div className="relative">
        <div className={field}>
          {input(false)}
          <ChevronDown size={18} aria-hidden className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </div>
        {open && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface shadow-lift">
            {list}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        ref={fieldRef as React.Ref<HTMLButtonElement>}
        type="button"
        aria-haspopup="dialog"
        aria-labelledby={`${labelledBy} ${uid}-value`}
        onClick={show}
        className={`${field} justify-between text-start`}
      >
        <span id={`${uid}-value`} className={selected ? "" : "text-muted"}>
          {selected ? (
            <>
              <Ltr>{selected.label}</Ltr>
              {selected.sub && <span className="ms-2 text-caption text-muted">{selected.sub}</span>}
            </>
          ) : (
            "בחרו מהרשימה"
          )}
        </span>
        <ChevronDown size={18} aria-hidden className="shrink-0 text-muted" />
      </button>
      <dialog
        ref={sheet}
        aria-label={title}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === sheet.current && hide()}
        className="sheet sheet-bottom h-[88dvh]"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-2">
            <h2 className="text-section font-semibold">{title}</h2>
            <button type="button" onClick={hide} aria-label="סגירה" className="-me-3 flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground">
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
          <div className="px-4 pt-3">
            {open && <SearchField {...inputProps(true)} className="min-h-12" />}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">{open && list}</div>
        </div>
      </dialog>
    </>
  );
}
