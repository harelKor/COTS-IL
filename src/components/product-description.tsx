import { AlertTriangle, Check, Info, Newspaper } from "lucide-react";
import { descriptionText, type DescBlock } from "@/lib/description";
import { ReadMore } from "./read-more";
import { SectionHeading } from "./section-heading";

/** A run of text this long reads better in two short columns than in one long one (from lg). */
const TWO_COLUMNS = 320;

/** One block of the supplier's text, laid out on the page itself (PP4). */
function Block({ block }: { block: DescBlock }) {
  switch (block.kind) {
    case "heading":
      return <h3 className="pdp-subhead pt-2 text-body font-semibold text-foreground">{block.text}</h3>;
    case "text": {
      const long = descriptionText(block.html).length > TWO_COLUMNS;
      // Sanitized at sync, then cleaned of the supplier's promos, prices, contacts and shop links.
      return <div className={`rich-text pdp-prose text-body leading-relaxed ${long ? "lg:columns-2 lg:gap-12" : "max-w-[72ch]"}`} dangerouslySetInnerHTML={{ __html: block.html }} />;
    }
    case "callout": {
      const Icon = block.tone === "important" ? AlertTriangle : Info;
      return (
        // The label is ours, in Hebrew; the supplier's words under it stay English.
        <div dir="rtl" lang="he" className="pdp-callout flex max-w-[72ch] gap-3 rounded-2xl p-4">
          <Icon size={20} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-callout font-semibold text-warning">{block.tone === "important" ? "חשוב" : "לתשומת לב"}</p>
            <div lang="en" dir="ltr" className="rich-text text-body leading-relaxed" dangerouslySetInnerHTML={{ __html: block.html }} />
          </div>
        </div>
      );
    }
    case "features":
      return (
        <ul className="grid gap-3 md:grid-cols-2">
          {block.items.map((item, i) => (
            <li key={i} className="pdp-feature flex gap-3 rounded-2xl p-4">
              <span aria-hidden className="pdp-check mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
                <Check size={14} strokeWidth={2.25} />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                {item.title && <p className="text-body font-semibold text-foreground">{item.title}</p>}
                {item.html && <div className="rich-text text-callout leading-relaxed text-muted" dangerouslySetInnerHTML={{ __html: item.html }} />}
              </div>
            </li>
          ))}
        </ul>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`pdp-list flex flex-col gap-2 ${block.items.length >= 4 ? "lg:block lg:columns-2 lg:gap-12" : "max-w-[72ch]"}`}>
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 break-inside-avoid pb-2 text-body leading-relaxed">
              <span aria-hidden className="pdp-dot mt-[0.6em] size-1.5 shrink-0 rounded-full" />
              <div className="rich-text min-w-0" dangerouslySetInnerHTML={{ __html: item }} />
            </li>
          ))}
        </Tag>
      );
    }
  }
}

/**
 * "סקירה": the supplier's description as part of the page (PP4). Headings, callouts for its
 * IMPORTANT and Note lines, a feature grid for its bold-lead lists, prose no wider than about 72
 * characters (two short columns for a long run, from lg), and "קראו עוד" as a fade.
 */
export function ProductDescription({ blocks, long }: { blocks: DescBlock[]; long: boolean }) {
  if (blocks.length === 0) return null;
  const body = (
    <div lang="en" dir="ltr" className="flex flex-col gap-5">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
  return (
    <section data-jump="סקירה" className="pdp-section pdp-band flex flex-col gap-5">
      <SectionHeading icon={<Newspaper size={20} strokeWidth={1.75} />} aside={<span className="glass-pill shrink-0 rounded-full px-3 py-1 text-caption">מהספק, באנגלית</span>}>
        סקירה
      </SectionHeading>
      {long ? <ReadMore>{body}</ReadMore> : body}
    </section>
  );
}
