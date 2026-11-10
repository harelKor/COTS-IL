import type { ReactNode } from "react";

/** The shared frame of the static info pages (/how-it-works, /faq, /shipping, …). */
export function InfoPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-title font-semibold">{title}</h1>
        {intro && <p className="text-muted">{intro}</p>}
      </header>
      {children}
    </article>
  );
}

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card-surface flex flex-col gap-3 rounded-card p-5 sm:p-6">
      <h2 className="text-section font-semibold">{title}</h2>
      <div className="flex flex-col gap-2 leading-relaxed">{children}</div>
    </section>
  );
}
