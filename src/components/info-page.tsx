import { ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { INFO_LINKS } from "@/domain/site-nav";

/** The shared frame of the static info pages (/how-it-works, /faq, /shipping, …). */

function NavLinks({ path }: { path: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {INFO_LINKS.map((l) => {
        const current = l.href === path;
        return (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={current ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-xl px-3 text-callout transition-colors ${
                current ? "bg-subtle font-semibold text-brand" : "text-muted hover:bg-subtle hover:text-foreground"
              }`}
            >
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Every info page, one tap away: a sticky side list from 1024px, a collapsible list above the page on phones. */
function InfoNav({ path }: { path: string }) {
  const here = INFO_LINKS.find((l) => l.href === path)?.label ?? "מידע";
  return (
    <>
      <details className="group card-surface rounded-card lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 font-medium [&::-webkit-details-marker]:hidden">
          <span>
            <span className="text-muted">מידע ועזרה: </span>
            {here}
          </span>
          <ChevronDown size={20} strokeWidth={1.75} aria-hidden className="text-muted transition-transform group-open:rotate-180" />
        </summary>
        <nav aria-label="דפי מידע" className="px-2 pb-2">
          <NavLinks path={path} />
        </nav>
      </details>
      <nav aria-label="דפי מידע" className="sticky top-20 hidden self-start lg:block">
        <NavLinks path={path} />
      </nav>
    </>
  );
}

/** `intro` is one paragraph; `lead` is rendered as given (the editable pages' intro blocks). `path` marks the page in the nav. */
export function InfoPage({
  title,
  path,
  intro,
  lead,
  children,
}: {
  title: string;
  path: string;
  intro?: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
      <InfoNav path={path} />
      <article className="flex min-w-0 max-w-2xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-title font-semibold">{title}</h1>
          {intro && <p className="text-muted">{intro}</p>}
          {lead}
        </header>
        {children}
      </article>
    </div>
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
