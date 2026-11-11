"use client";

import Link from "next/link";

/** Any page that fails shows this Hebrew page instead of Next's English one. */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <div role="alert" className="card-surface mx-auto flex max-w-xl flex-col items-center gap-4 p-8 text-center">
      <h1 className="text-section font-semibold">משהו השתבש</h1>
      <p className="text-muted">הדף לא נטען. אפשר לנסות שוב, ואם זה חוזר, לחזור לדף הבית או לפנות אלינו.</p>
      {digest && (
        <p className="text-caption text-muted">
          קוד שגיאה: <bdi dir="ltr">{digest}</bdi>
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className="btn-brand min-h-11 rounded-full px-6">
          לנסות שוב
        </button>
        <Link href="/" className="flex min-h-11 items-center rounded-full px-5 text-brand hover:underline">
          לדף הבית
        </Link>
      </div>
    </div>
  );
}
