"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { Alert, Button, fieldClass } from "@/components/form";
import { InfoBody, InfoIntro } from "@/components/info-text";
import { showToast } from "@/components/toast";
import { parseInfoText, resolveInfo, unknownTokens, type InfoPageKey } from "@/domain/info-text";
import { restoreContent, saveBanner, saveExamples, savePage, type ContentResult } from "./actions";

/** "נשמר" with Undo, or the error. */
export function done(r: ContentResult, after?: () => void) {
  if (!r.ok) return showToast(r.error, "error");
  const before = r.before;
  after?.();
  showToast(r.message, "default", {
    label: "ביטול",
    run: () =>
      void restoreContent(before).then((u) => {
        showToast(u.ok ? u.message : u.error, u.ok ? "default" : "error");
        if (u.ok) location.reload();
      }),
  });
}

export function ExamplesForm({ examples }: { examples: string[] }) {
  const [pending, start] = useTransition();
  const id = useId();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => done(await saveExamples(form)));
      }}
    >
      <label htmlFor={id} className="sr-only">
        דוגמאות חיפוש, אחת בכל שורה
      </label>
      <textarea id={id} name="examples" dir="ltr" rows={6} defaultValue={examples.join("\n")} className={`${fieldClass} h-auto py-2 font-mono`} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "שומר…" : "שמירה"}
        </Button>
      </div>
    </form>
  );
}

export function BannerForm({ banner }: { banner: { enabled: boolean; text: string; href: string | null; endsOn: string | null } }) {
  const [pending, start] = useTransition();
  const id = useId();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => done(await saveBanner(form)));
      }}
    >
      <label className="flex min-h-11 items-center gap-3 text-callout font-medium">
        <input type="checkbox" name="enabled" defaultChecked={banner.enabled} className="size-5 accent-brand" />
        להציג את ההודעה
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-text`} className="text-callout font-medium">
          טקסט
        </label>
        <input id={`${id}-text`} name="text" defaultValue={banner.text} maxLength={200} className={fieldClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-href`} className="text-callout font-medium">
            קישור (לא חובה)
          </label>
          <input id={`${id}-href`} name="href" dir="ltr" defaultValue={banner.href ?? ""} placeholder="/shipping" className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-ends`} className="text-callout font-medium">
            יום אחרון (לא חובה)
          </label>
          <input id={`${id}-ends`} name="endsOn" type="date" defaultValue={banner.endsOn ?? ""} className={fieldClass} />
        </div>
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "שומר…" : "שמירה"}
        </Button>
      </div>
    </form>
  );
}

/** One info page's text with a live preview, the tokens it can use, and "back to the original". */
export function PageEditor({
  page,
  path,
  title,
  text,
  edited,
  facts,
  blocks,
  inlineHelp,
  blockHelp,
}: {
  page: InfoPageKey;
  path: string;
  title: string;
  text: string;
  edited: boolean;
  facts: Record<string, string>;
  blocks: Partial<Record<string, ReactNode>>;
  inlineHelp: [string, string][];
  blockHelp: [string, string][];
}) {
  const [value, setValue] = useState(text);
  const [pending, start] = useTransition();
  const id = useId();
  const doc = useMemo(() => resolveInfo(parseInfoText(value), facts, new Set(Object.keys(blocks))), [value, facts, blocks]);
  const unknown = useMemo(() => unknownTokens(value), [value]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={id} className="text-callout font-medium">
            הטקסט של ״{title}״
          </label>
          <textarea id={id} value={value} onChange={(e) => setValue(e.target.value)} rows={22} className={`${fieldClass} h-auto py-2 leading-relaxed`} />
          {unknown.length > 0 && <Alert>לא מוכר: {unknown.map((u) => `{${u}}`).join(", ")}. זה יוצג ריק.</Alert>}
          <details className="text-caption text-muted">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium text-foreground">איך כותבים</summary>
            <ul className="flex flex-col gap-1 ps-4">
              <li>
                <code>## כותרת</code> פותחת חלק{page === "faq" ? " (כאן: שאלה)" : ""}. טקסט לפני הכותרת הראשונה מופיע מתחת לשם העמוד.
              </li>
              <li>שורה ריקה פותחת פסקה. <code>- </code> בתחילת שורה: רשימה.</li>
              <li>
                <code>**מודגש**</code>, <code>[טקסט](/contact)</code> לקישור.
              </li>
              {page === "how" && (
                <li>
                  <code>1. **כותרת** טקסט</code> הוא שלב בכרטיס. השלבים מופיעים גם בדף הבית.
                </li>
              )}
              {inlineHelp.map(([k, v]) => (
                <li key={k}>
                  <code>{`{${k}}`}</code>: {v}
                </li>
              ))}
              {blockHelp.map(([k, v]) => (
                <li key={k}>
                  <code>{`{{${k}}}`}</code> בשורה לבד: {v}
                </li>
              ))}
            </ul>
          </details>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-callout font-medium">תצוגה מקדימה</p>
          <div className="flex flex-col gap-4 rounded-2xl bg-subtle/60 p-3 sm:p-4" aria-live="polite">
            <InfoIntro doc={doc} auto={blocks} />
            <InfoBody doc={doc} auto={blocks} faq={page === "faq"} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" disabled={pending || value === text} onClick={() => start(async () => done(await savePage(page, value)))}>
          {pending ? "שומר…" : "שמירה"}
        </Button>
        {edited && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => done(await savePage(page, null), () => location.reload()))}>
            חזרה לטקסט המקורי
          </Button>
        )}
        <Link href={path} className="text-callout text-brand hover:underline" target="_blank">
          פתיחת העמוד
        </Link>
      </div>
    </div>
  );
}
