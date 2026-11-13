import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { Block, InfoDoc, Inline } from "@/domain/info-text";
import { InfoSection } from "./info-page";
import { Ltr } from "./ltr";

/**
 * Renders an info page's resolved text (src/domain/info-text.ts). No hooks, so the site's
 * server pages and the admin's live preview share it. Latin runs ("The Thrifty Bot") go in
 * <Ltr> on their own.
 */

const LATIN = /([A-Za-z][A-Za-z0-9.\-+/#'"]*(?: [A-Za-z0-9][A-Za-z0-9.\-+/#'"]*)*)/;

function text(v: string): ReactNode {
  return v.split(LATIN).map((part, i) => (i % 2 === 1 ? <Ltr key={i}>{part}</Ltr> : part));
}

function InlineView({ inline }: { inline: Inline[] }) {
  return inline.map((i, n) => {
    if (i.t === "bold") return <strong key={n} className="font-semibold">{text(i.v)}</strong>;
    if (i.t === "link") {
      const cls = "text-brand hover:underline";
      return i.href.startsWith("/") ? (
        <Link key={n} href={i.href} className={cls}>
          {text(i.v)}
        </Link>
      ) : (
        <a key={n} href={i.href} className={cls} target="_blank" rel="noopener noreferrer">
          {text(i.v)}
        </a>
      );
    }
    if (i.t === "fact" && i.name === "מכפיל") return <bdi key={n} dir="ltr">{i.v}</bdi>;
    return <Fragment key={n}>{text(i.v)}</Fragment>;
  });
}

function Blocks({ blocks, auto }: { blocks: Block[]; auto: Partial<Record<string, ReactNode>> }) {
  return blocks.map((b, n) => {
    if (b.t === "auto") return <Fragment key={n}>{auto[b.name]}</Fragment>;
    if (b.t === "list")
      return (
        <ul key={n} className="flex list-disc flex-col gap-1 ps-5">
          {b.items.map((item, k) => (
            <li key={k}>
              <InlineView inline={item} />
            </li>
          ))}
        </ul>
      );
    return (
      <p key={n}>
        <InlineView inline={b.inline} />
      </p>
    );
  });
}

/** The intro under the page title. */
export function InfoIntro({ doc, auto }: { doc: InfoDoc; auto: Partial<Record<string, ReactNode>> }) {
  if (doc.intro.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 text-muted">
      <Blocks blocks={doc.intro} auto={auto} />
    </div>
  );
}

/** Sections as cards, or on the FAQ page as one card of questions that open. */
export function InfoBody({ doc, auto, faq }: { doc: InfoDoc; auto: Partial<Record<string, ReactNode>>; faq: boolean }) {
  if (faq)
    return (
      <div className="card-surface flex flex-col divide-y divide-line rounded-card px-5 sm:px-6">
        {doc.sections.map((s, n) => (
          <details key={n} className="group py-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium">
              <span>{text(s.title)}</span>
              <span aria-hidden className="text-muted transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="flex flex-col gap-2 pb-3 leading-relaxed text-muted">
              <Blocks blocks={s.blocks} auto={auto} />
            </div>
          </details>
        ))}
      </div>
    );
  return doc.sections.map((s, n) => (
    <InfoSection key={n} title={s.title}>
      <Blocks blocks={s.blocks} auto={auto} />
    </InfoSection>
  ));
}
