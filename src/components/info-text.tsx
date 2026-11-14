import { ChevronDown, ClipboardCheck, PackageCheck, Send, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { CONTACT_US, writeUsHref, type Block, type InfoDoc, type Inline, type Step } from "@/domain/info-text";
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
    if (i.t === "fact" && i.name === "כתבו לנו")
      return (
        <Link key={n} href={writeUsHref(i.v)} className="text-brand hover:underline">
          {i.v}
        </Link>
      );
    if (i.t === "fact" && i.name === "צרו קשר")
      return i.v === CONTACT_US ? (
        <Link key={n} href="/contact" className="text-brand hover:underline">
          {i.v}
        </Link>
      ) : (
        <Fragment key={n}>
          {i.v} (
          <Link href="/orders" className="text-brand hover:underline">
            ההזמנות
          </Link>
          )
        </Fragment>
      );
    return <Fragment key={n}>{text(i.v)}</Fragment>;
  });
}

const STEP_ICONS = [ShoppingCart, Send, ClipboardCheck, PackageCheck];

/** The order flow as numbered cards: the "איך זה עובד" page and the home page. */
export function StepCards({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => {
        const Icon = STEP_ICONS[i % STEP_ICONS.length];
        return (
          <li key={i} className="card-surface flex flex-col gap-2 rounded-card p-5">
            <span className="flex items-center gap-2">
              <span className="btn-brand flex size-8 items-center justify-center rounded-full text-caption font-semibold tabular-nums">{i + 1}</span>
              <Icon size={20} strokeWidth={1.75} aria-hidden className="text-brand" />
            </span>
            <h3 className="text-body font-semibold">{text(s.title)}</h3>
            <p className="text-caption leading-relaxed text-muted">
              <InlineView inline={s.text} />
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function Blocks({ blocks, auto }: { blocks: Block[]; auto: Partial<Record<string, ReactNode>> }) {
  return blocks.map((b, n) => {
    if (b.t === "auto") return <Fragment key={n}>{auto[b.name]}</Fragment>;
    if (b.t === "steps") return <StepCards key={n} steps={b.items} />;
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

/** The intro under the page title. Step cards in the intro show below the header, at the top of the body (InfoBody). */
export function InfoIntro({ doc, auto }: { doc: InfoDoc; auto: Partial<Record<string, ReactNode>> }) {
  const intro = doc.intro.filter((b) => b.t !== "steps");
  if (intro.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 text-muted">
      <Blocks blocks={intro} auto={auto} />
    </div>
  );
}

/** Sections as cards, or on the FAQ page as one card of questions that open. */
export function InfoBody({ doc, auto, faq }: { doc: InfoDoc; auto: Partial<Record<string, ReactNode>>; faq: boolean }) {
  const steps = doc.intro.filter((b) => b.t === "steps");
  const sections = <Sections doc={doc} auto={auto} faq={faq} />;
  if (steps.length === 0) return sections;
  return (
    <>
      <Blocks blocks={steps} auto={auto} />
      {sections}
    </>
  );
}

function Sections({ doc, auto, faq }: { doc: InfoDoc; auto: Partial<Record<string, ReactNode>>; faq: boolean }) {
  if (faq)
    return (
      <div className="card-surface flex flex-col divide-y divide-line rounded-card px-5 sm:px-6">
        {doc.sections.map((s, n) => (
          <details key={n} open={n === 0} className="group py-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
              <span>{text(s.title)}</span>
              <ChevronDown size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
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
