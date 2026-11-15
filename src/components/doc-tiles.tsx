"use client";

import { ArrowUpLeft, BookOpen, Box, FileText, Gauge, PencilRuler, Store, Table2 } from "lucide-react";
import type { DocTile, DocType } from "@/domain/doc-links";
import { vendorTheme } from "@/domain/vendors";
import { Ltr } from "./ltr";
import { ThemedLogo } from "./vendor-mark";
import { SectionHeading } from "./section-heading";
import { useChoice } from "./spec-table";

/** An icon for each kind of document. */
const ICONS: Record<DocType, typeof FileText> = {
  cad: Box,
  guide: BookOpen,
  drawing: PencilRuler,
  datasheet: Gauge,
  chart: Table2,
  other: FileText,
};

export type VendorPage = { code: string; name: string; logoUrl: string | null; href: string };

/**
 * A two-vendor page's tile wears its own vendor's palette (vendorTheme re-points the tokens inside
 * it); on a one-vendor page the whole page already does.
 */
function themeOf(code: string | undefined, names: Map<string, string>, blend: boolean) {
  if (!blend || !code) return undefined;
  return vendorTheme({ code, name: names.get(code) ?? code }) as React.CSSProperties;
}

const tile =
  "doc-tile group flex min-h-[72px] items-center gap-3 rounded-2xl border p-3 text-start transition-[border-color,background-color,translate] duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0";

/**
 * "תיעוד" under the buy box (PP4): the vendor's own product page first, with its logo, then the
 * documents as tiles: an icon by type, a bold Hebrew label (or the document's own name when two
 * share one), and where it opens ("PDF", "Google Drive") instead of a hostname. The vendor's page
 * follows the choice when each size has a page of its own (WCP belts).
 */
export function DocTiles({ familyId, tiles, vendors }: { familyId: string; tiles: DocTile[]; vendors: VendorPage[] }) {
  const choice = useChoice(familyId);
  const blend = vendors.length > 1;
  const names = new Map(vendors.map((v) => [v.code, v.name]));
  if (tiles.length === 0 && vendors.length === 0) return null;
  // The page every remaining variant of that vendor is on, once the choice narrows it to one.
  const pageOf = (v: VendorPage) => {
    const urls = new Set((choice ?? []).filter((c) => c.supplierCode === v.code && c.productUrl).map((c) => c.productUrl));
    return urls.size === 1 ? [...urls][0]! : v.href;
  };
  return (
    <section data-jump="תיעוד" className="pdp-section flex flex-col gap-4">
      <SectionHeading icon={<FileText size={20} strokeWidth={1.75} />}>תיעוד</SectionHeading>
      <ul className="grid gap-3 sm:grid-cols-2">
        {vendors.map((v) => (
          <li key={v.code} style={themeOf(v.code, names, blend)} className={blend ? "vendor-theme" : undefined}>
            <a href={pageOf(v)} target="_blank" rel="noopener noreferrer" className={`${tile} doc-tile-vendor`}>
              <span aria-hidden className="doc-icon flex size-11 shrink-0 items-center justify-center rounded-xl">
                <Store size={20} strokeWidth={1.75} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-callout font-semibold text-foreground">
                  דף המוצר אצל <Ltr>{v.name}</Ltr>
                </span>
                {v.logoUrl ? (
                  // The vendor's logo (in the theme's ink), small, as the tile's source line.
                  <span className="flex">
                    <ThemedLogo src={v.logoUrl} className="h-5 w-auto max-w-[110px] object-contain object-start" />
                  </span>
                ) : (
                  <span className="text-caption text-muted">האתר של הספק</span>
                )}
              </span>
              <ArrowUpLeft size={18} aria-hidden className="doc-arrow shrink-0 text-muted transition-transform duration-200" />
            </a>
          </li>
        ))}
        {tiles.map((d) => {
          const Icon = ICONS[d.type];
          return (
            <li key={d.href} style={themeOf(d.vendor, names, blend)} className={blend ? "vendor-theme" : undefined}>
              {/* What it opens; the supplier's own words in the tooltip. */}
              <a href={d.href} target="_blank" rel="noopener noreferrer" title={d.text} className={tile}>
                <span aria-hidden className="doc-icon flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="line-clamp-2 text-callout font-semibold text-foreground">{d.kind ? <Ltr>{d.title}</Ltr> : d.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-caption text-muted">
                    {d.kind && <span>{d.kind}</span>}
                    <span className="doc-tag rounded-md px-1.5">{/[a-z]/i.test(d.tag) ? <Ltr>{d.tag}</Ltr> : d.tag}</span>
                  </span>
                </span>
                <ArrowUpLeft size={18} aria-hidden className="doc-arrow shrink-0 text-muted transition-transform duration-200" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
