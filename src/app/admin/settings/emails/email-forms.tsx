"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Alert, Button, fieldClass } from "@/components/form";
import { showToast } from "@/components/toast";
import { unknownEmailTokens } from "@/domain/email-overrides";
import { done } from "../content/content-forms";
import { previewTemplate, saveTemplate, sendTemplateTest } from "./actions";

export type TemplateRow = {
  key: string;
  label: string;
  audience: string;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  tokens: string[];
  hasSample: boolean;
};

/** One email: its subject and body, the tokens to put in, a preview, a test send and "back to the original". */
function TemplateEditor({ row, canSend }: { row: TemplateRow; canSend: boolean }) {
  const [subject, setSubject] = useState(row.subject);
  const [body, setBody] = useState(row.body);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [pending, start] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const edited = row.subject !== "" || row.body !== "";
  const unknown = unknownEmailTokens(`${subject}\n${body}`, row.tokens);

  const insert = (token: string) => {
    const el = bodyRef.current;
    const at = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? at;
    setBody(`${body.slice(0, at)}{${token}}${body.slice(end)}`);
    el?.focus();
  };

  return (
    <div className="flex flex-col gap-3 pb-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-s`} className="text-callout font-medium">
          נושא
        </label>
        <input id={`${id}-s`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder={row.defaultSubject} className={fieldClass} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-b`} className="text-callout font-medium">
          טקסט
        </label>
        <textarea
          id={`${id}-b`}
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          maxLength={3000}
          placeholder={row.defaultBody}
          className={`${fieldClass} h-auto py-2 leading-relaxed`}
        />
        <p className="text-caption text-muted">שורה ריקה פותחת פסקה חדשה. ריק: הטקסט המקורי, כמו שמוצג בשדה.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2" aria-label="פרטים להוספה לטקסט">
        <span className="text-caption text-muted">להוספה לטקסט:</span>
        {row.tokens.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => insert(t)}
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-3 text-caption hover:bg-subtle"
          >
            {`{${t}}`}
          </button>
        ))}
      </div>
      {unknown.length > 0 && <Alert>לא מוכר: {unknown.map((u) => `{${u}}`).join(", ")}. זה יוצג ריק.</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" disabled={pending || (subject === row.subject && body === row.body)} onClick={() => start(async () => done(await saveTemplate(row.key, subject, body)))}>
          {pending ? "שומר…" : "שמירה"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !row.hasSample}
          onClick={() =>
            start(async () => {
              const r = await previewTemplate(row.key, subject, body);
              if (r.ok) setPreview({ subject: r.subject, html: r.html });
              else showToast(r.error, "error");
            })
          }
        >
          תצוגה מקדימה
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !canSend || !row.hasSample}
          title={canSend ? undefined : "המייל לא מוגדר: חסרים RESEND_API_KEY או EMAIL_FROM ב-Vercel"}
          onClick={() =>
            start(async () => {
              const r = await sendTemplateTest(row.key, subject, body);
              showToast(r.ok ? (r.message ?? "נשלח") : r.error, r.ok ? "default" : "error");
            })
          }
        >
          שליחת בדיקה אליי
        </Button>
        {edited && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setSubject("");
                setBody("");
                done(await saveTemplate(row.key, "", ""), () => location.reload());
              })
            }
          >
            חזרה לטקסט המקורי
          </Button>
        )}
      </div>
      {!canSend && <p className="text-caption text-muted">שליחת בדיקה תעבוד אחרי שמגדירים את המייל (RESEND_API_KEY ו-EMAIL_FROM ב-Vercel).</p>}
      {preview && (
        <div className="flex flex-col gap-2">
          <p className="text-callout">
            <span className="text-muted">נושא: </span>
            {preview.subject}
          </p>
          <iframe title={`תצוגה מקדימה: ${row.label}`} srcDoc={preview.html} sandbox="" className="h-[520px] w-full rounded-2xl border border-line bg-white" />
        </div>
      )}
    </div>
  );
}

/** Every email the site sends, each opening into its editor. */
export function EmailTemplates({ rows, canSend }: { rows: TemplateRow[]; canSend: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-line">
      {rows.map((row) => (
        <details key={row.key} className="group py-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
            <span>
              {row.label} <span className="text-caption font-normal text-muted">({row.audience})</span>
            </span>
            {(row.subject !== "" || row.body !== "") && <span className="text-caption text-muted">(נערך)</span>}
          </summary>
          <TemplateEditor row={row} canSend={canSend} />
        </details>
      ))}
    </div>
  );
}
