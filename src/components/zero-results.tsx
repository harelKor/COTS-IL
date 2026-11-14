"use client";

import { CheckCircle2, Link2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import type { SearchResponse } from "@/app/api/search/route";
import { requestPart, type PartRequestState } from "@/app/catalog/actions";
import { PART_REQUEST_LIMITS } from "@/domain/part-request";
import { catalogHref } from "@/lib/catalog-filters";
import { normalizeSearch } from "@/lib/quick-query";
import { useSiteFacts } from "./site-facts";
import { CategoryIcon } from "./category-icon";
import { Ltr } from "./ltr";

type Props = {
  /** What was searched. */
  q: string;
  /** Close titles, when the caller already has them (the search panel); otherwise fetched. */
  suggestions?: string[];
  /** Pick a suggestion inside the caller (the panel searches it in place); otherwise a link to the catalog. */
  onSuggest?: (text: string) => void;
  /** Called before following a link, so the panel can close. */
  onNavigate?: () => void;
};

const chip =
  "flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-caption hover:bg-subtle";

/**
 * When a search finds nothing (S5 task 8): titles it may have meant, the categories,
 * and "send us a link to the part", one link and a note to the admin.
 */
export function ZeroResults({ q, suggestions, onSuggest, onNavigate }: Props) {
  const { searchCategories } = useSiteFacts();
  const [fetched, setFetched] = useState<{ q: string; list: string[] } | null>(
    null,
  );
  useEffect(() => {
    if (suggestions || q.trim().length < 2) return;
    const controller = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(normalizeSearch(q))}`, {
      signal: controller.signal,
    })
      .then((r) => r.json() as Promise<SearchResponse>)
      .then((body) => setFetched({ q, list: body.suggestions ?? [] }))
      .catch(() => {});
    return () => controller.abort();
  }, [q, suggestions]);
  const list = suggestions ?? (fetched?.q === q ? fetched.list : []);

  return (
    <div className="flex flex-col gap-5 text-start">
      {list.length > 0 && (
        <section>
          <h2 className="mb-2 text-caption text-muted">התכוונתם ל…</h2>
          <ul className="flex flex-wrap gap-2">
            {list.map((title) => (
              <li key={title} className="min-w-0 max-w-full">
                {onSuggest ? (
                  <button
                    type="button"
                    onClick={() => onSuggest(title)}
                    className={`${chip} max-w-full`}
                  >
                    <Ltr className="truncate">{title}</Ltr>
                  </button>
                ) : (
                  <Link
                    href={catalogHref({ q: title })}
                    onClick={onNavigate}
                    className={`${chip} max-w-full`}
                  >
                    <Ltr className="truncate">{title}</Ltr>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2 className="mb-2 text-caption text-muted">קטגוריות</h2>
        <ul className="grid gap-1 sm:grid-cols-2">
          {searchCategories.map((c) => (
            <li key={c.slug}>
              <Link
                href={catalogHref({ category: c.slug })}
                onClick={onNavigate}
                className="flex min-h-11 items-center gap-3 rounded-xl p-1 hover:bg-subtle"
              >
                <CategoryIcon slug={c.slug} />
                <span className="text-callout">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <RequestPart q={q} onNavigate={onNavigate} />
    </div>
  );
}

/**
 * "לא מצאתם? שלחו לנו קישור לחלק": collapsed to one button until it's wanted. The
 * product page reuses it as "בקשה בכל זאת" for a part we can't sell right now, with
 * the supplier's link and the SKU filled in.
 */
export function RequestPart({
  q,
  onNavigate,
  url,
  note,
  label = "לא מצאתם? שלחו לנו קישור לחלק",
  hint = "קישור לדף החלק אצל הספק (כל ספק), ואם צריך גם מידה, כמות או הערה. נבדוק ונחזור אליכם.",
  back,
}: {
  q: string;
  onNavigate?: () => void;
  url?: string;
  note?: string;
  label?: string;
  hint?: string;
  /** Where sign-in returns to; the search by default. */
  back?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<PartRequestState, FormData>(
    requestPart,
    { status: "idle" },
  );
  const id = useId();

  if (state.status === "sent") {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-caption text-success"
      >
        <CheckCircle2 size={18} aria-hidden />
        קיבלנו את הקישור. נבדוק את החלק ונחזור אליכם.
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-2 self-start text-brand hover:text-brand-strong"
      >
        <Link2 size={18} aria-hidden />
        {label}
      </button>
    );
  }
  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
    >
      <p className="text-caption text-muted">{hint}</p>
      <input type="hidden" name="query" value={q} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-url`} className="text-sm font-medium">
          קישור לחלק
        </label>
        <input
          id={`${id}-url`}
          name="url"
          type="url"
          inputMode="url"
          dir="ltr"
          required
          autoFocus={!url}
          defaultValue={url}
          maxLength={PART_REQUEST_LIMITS.url}
          placeholder="https://"
          className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-note`} className="text-sm font-medium">
          הערה <span className="font-normal text-muted">(לא חובה)</span>
        </label>
        <textarea
          id={`${id}-note`}
          name="note"
          rows={2}
          defaultValue={note}
          autoFocus={!!url}
          maxLength={PART_REQUEST_LIMITS.note}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-base"
        />
      </div>
      {state.status === "error" && (
        <p role="alert" className="text-caption text-danger">
          {state.error}
        </p>
      )}
      {state.status === "signed-out" && (
        <p role="alert" className="text-caption">
          צריך להתחבר לחשבון הקבוצה כדי לשלוח.{" "}
          <Link
            href={`/login?next=${encodeURIComponent(back ?? catalogHref({ q }))}`}
            onClick={onNavigate}
            className="text-brand underline-offset-2 hover:underline"
          >
            התחברות
          </Link>
        </p>
      )}
      <button
        disabled={pending}
        className="btn-brand min-h-11 self-start rounded-full px-6 font-medium disabled:opacity-60"
      >
        {pending ? "שולח…" : "שליחה"}
      </button>
    </form>
  );
}
