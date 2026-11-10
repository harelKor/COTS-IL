"use client";

import Link from "next/link";

/** Any admin page that fails or times out shows this instead of a page that never finishes. */
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <div role="alert" className="card-surface mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
      <h1 className="text-section font-semibold">הדף לא נטען</h1>
      <p className="text-muted">משהו השתבש בטעינת הנתונים. אפשר לנסות שוב, ואם זה חוזר, לחזור לרשימת ההזמנות.</p>
      {digest && (
        <p className="text-caption text-muted">
          קוד שגיאה: <bdi dir="ltr">{digest}</bdi>
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className="btn-brand min-h-11 rounded-full px-6">
          לנסות שוב
        </button>
        <Link href="/admin" className="flex min-h-11 items-center rounded-full px-5 text-brand hover:underline">
          לכל ההזמנות
        </Link>
      </div>
    </div>
  );
}
