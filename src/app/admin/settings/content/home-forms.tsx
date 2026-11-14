"use client";

import { useId, useTransition } from "react";
import { Button, fieldClass } from "@/components/form";
import { HOME_TOKENS, type HomeText } from "@/domain/site-text";
import { saveHome, saveTagline } from "./actions";
import { done } from "./content-forms";

/** The one-line description of the site, with "back to the original". */
export function TaglineForm({ tagline, edited }: { tagline: string; edited: boolean }) {
  const [pending, start] = useTransition();
  const id = useId();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => done(await saveTagline(form)));
      }}
    >
      <label htmlFor={id} className="sr-only">
        תיאור האתר במשפט אחד
      </label>
      <textarea id={id} name="tagline" rows={2} maxLength={160} defaultValue={tagline} className={`${fieldClass} h-auto py-2`} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "שומר…" : "שמירה"}
        </Button>
        {edited && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => start(async () => done(await saveTagline(new FormData()), () => location.reload()))}
          >
            חזרה לטקסט המקורי
          </Button>
        )}
      </div>
    </form>
  );
}

/** The home page's words: motto, sub-line, and the four "למה" cards. The look doesn't change. */
export function HomeWordsForm({ home, edited }: { home: HomeText; edited: boolean }) {
  const [pending, start] = useTransition();
  const id = useId();
  const tokens = Object.entries(HOME_TOKENS);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => done(await saveHome(form)));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-line`} className="text-callout font-medium">
            הסיסמה, שורה ראשונה
          </label>
          <input id={`${id}-line`} name="mottoLine" defaultValue={home.mottoLine} maxLength={80} className={fieldClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-accent`} className="text-callout font-medium">
            הסיסמה, שורה שנייה (בצבע)
          </label>
          <input id={`${id}-accent`} name="mottoAccent" defaultValue={home.mottoAccent} maxLength={40} className={fieldClass} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-sub`} className="text-callout font-medium">
          משפט מתחת לסיסמה
        </label>
        <input id={`${id}-sub`} name="sub" defaultValue={home.sub} maxLength={200} className={fieldClass} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-why`} className="text-callout font-medium">
          כותרת הכרטיסים
        </label>
        <input id={`${id}-why`} name="whyHeading" defaultValue={home.whyHeading} maxLength={80} className={fieldClass} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {home.why.map((card, i) => (
          <fieldset key={i} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line p-3">
            <legend className="px-1 text-caption text-muted">כרטיס {i + 1}</legend>
            <label htmlFor={`${id}-t${i}`} className="sr-only">
              כותרת כרטיס {i + 1}
            </label>
            <input id={`${id}-t${i}`} name={`why${i}title`} defaultValue={card.title} maxLength={60} className={`${fieldClass} font-medium`} />
            <label htmlFor={`${id}-x${i}`} className="sr-only">
              טקסט כרטיס {i + 1}
            </label>
            <textarea id={`${id}-x${i}`} name={`why${i}text`} rows={3} defaultValue={card.text} maxLength={300} className={`${fieldClass} h-auto py-2`} />
          </fieldset>
        ))}
      </div>
      <p className="text-caption text-muted">
        בטקסט של כרטיס אפשר לכתוב {tokens.map(([k, v], i) => (
          <span key={k}>
            {i > 0 && ", "}
            <code>{`{${k}}`}</code> ({v})
          </span>
        ))}
        . הכרטיס ״החזרות בישראל״ מופיע לבד כשמולאה מדיניות החזרות בפרטי העסק.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "שומר…" : "שמירה"}
        </Button>
        {edited && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => done(await saveHome(new FormData(), true), () => location.reload()))}>
            חזרה לטקסט המקורי
          </Button>
        )}
      </div>
    </form>
  );
}
