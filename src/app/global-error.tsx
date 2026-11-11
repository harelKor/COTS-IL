"use client";

import "./globals.css";

/** Last resort when the root layout itself fails: it replaces the layout, so it brings its own html and body. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <html lang="he" dir="rtl">
      <body className="flex min-h-full flex-col items-center justify-center p-6 font-sans">
        <div role="alert" className="card-surface flex max-w-xl flex-col items-center gap-4 p-8 text-center">
          <h1 className="text-section font-semibold">משהו השתבש</h1>
          <p className="text-muted">האתר לא נטען. נסו שוב בעוד רגע.</p>
          {digest && (
            <p className="text-caption text-muted">
              קוד שגיאה: <bdi dir="ltr">{digest}</bdi>
            </p>
          )}
          <button type="button" onClick={() => retry()} className="btn-brand min-h-11 rounded-full px-6">
            לנסות שוב
          </button>
        </div>
      </body>
    </html>
  );
}
