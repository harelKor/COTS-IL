import type { Metadata } from "next";
import Link from "next/link";
import { asc, isNotNull } from "drizzle-orm";
import { Suspense } from "react";
import { Card } from "@/components/form";
import { infoBlocks, infoFacts } from "@/components/info-text-page";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { db, schema } from "@/db";
import { BLOCK_TOKENS, DEFAULT_PAGES, INFO_PAGES, INLINE_TOKENS, type InfoPageKey } from "@/domain/info-text";
import { requireAdmin } from "@/lib/auth";
import { familyHref } from "@/lib/catalog-links";
import { getSettings } from "@/lib/settings";
import { DEFAULT_HOME, DEFAULT_TAGLINE } from "@/domain/site-text";
import { BannerForm, ExamplesForm, PageEditor } from "./content-forms";
import { HomeWordsForm, TaglineForm } from "./home-forms";
import { PinForm, UnpinButton } from "./pin-forms";

export const metadata: Metadata = { title: "הגדרות: תוכן האתר" };
/** Pinning regroups the catalog (about 10 s). */
export const maxDuration = 60;

async function Pins() {
  const f = schema.productFamilies;
  const pins = await db.select({ slug: f.slug, title: f.title, rank: f.pinnedRank }).from(f).where(isNotNull(f.pinnedRank)).orderBy(asc(f.pinnedRank)).limit(50);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-section font-semibold">״מומלץ״</h2>
        <p className="text-caption text-muted">מוצרים שמוצמדים ראשונים ב״הכי מבוקשים״ של כל ספק ובמיון ״מומלץ״, לפי המקום (1 ראשון). כל שינוי מעדכן את הקטלוג תוך כ-10 שניות.</p>
      </div>
      <PinForm />
      {pins.length === 0 ? (
        <p className="text-callout text-muted">אין מוצרים מוצמדים.</p>
      ) : (
        <ol className="divide-y divide-line">
          {pins.map((p) => (
            <li key={p.slug} className="flex min-h-11 items-center justify-between gap-3 py-1 text-callout">
              <Link href={familyHref(p.slug)} className="min-w-0 truncate hover:text-brand">
                <bdi dir="ltr">{p.title}</bdi>
              </Link>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-caption text-muted tabular-nums">מקום {p.rank}</span>
                <UnpinButton slug={p.slug} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/admin/settings/content">["searchParams"] }) {
  await requireAdmin();
  const params = await searchParams;
  const page: InfoPageKey = INFO_PAGES.find((p) => p.key === params.page)?.key ?? "faq";
  const { content, business } = await getSettings();
  const [blocks, facts] = await Promise.all([infoBlocks(business), infoFacts(business)]);
  const info = INFO_PAGES.find((p) => p.key === page)!;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-section font-semibold">דוגמאות חיפוש</h2>
            <p className="text-caption text-muted">הכפתורים מתחת לחיפוש בדף הבית ובחלון החיפוש. כל שורה היא חיפוש אחד, עד 8.</p>
          </div>
          <ExamplesForm examples={content.searchExamples} />
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-section font-semibold">הודעה בראש האתר</h2>
            <p className="text-caption text-muted">פס מעל הכותרת בכל העמודים, למשל ״סגור בחג עד 20.11״.</p>
          </div>
          <BannerForm banner={content.banner} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-section font-semibold">תיאור האתר</h2>
            <p className="text-caption text-muted">משפט אחד: תיאור האתר בגוגל ובשיתוף, באפליקציה המותקנת ובתחתית המיילים. בתמונת השיתוף הוא מופיע רק אם כתוב באנגלית.</p>
          </div>
          <TaglineForm tagline={content.tagline} edited={content.tagline !== DEFAULT_TAGLINE} />
        </Card>
        <Card className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-section font-semibold">דף הבית</h2>
            <p className="text-caption text-muted">הסיסמה שבראש הדף ו״למה דרך COTS-IL״. העיצוב נשאר כמו שהוא; רק המילים משתנות.</p>
          </div>
          <HomeWordsForm home={content.home} edited={JSON.stringify(content.home) !== JSON.stringify(DEFAULT_HOME)} />
        </Card>
      </div>

      <Pins />

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">עמודי מידע</h2>
          <p className="text-caption text-muted">הטקסט של העמודים בתחתית האתר. מה שלא ממלאים בפרטי העסק לא מופיע.</p>
        </div>
        <nav aria-label="עמודי מידע" className="-mx-1 overflow-x-auto px-1">
          <ul className="flex w-max gap-2">
            {INFO_PAGES.map((p) => (
              <li key={p.key}>
                <Link
                  href={`?page=${p.key}`}
                  scroll={false}
                  aria-current={p.key === page ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-callout whitespace-nowrap ${
                    p.key === page ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-line bg-surface hover:bg-subtle"
                  }`}
                >
                  {p.title}
                  {content.pages[p.key] !== null && <span className="text-caption text-muted">(נערך)</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <PageEditor
          key={page}
          page={page}
          path={info.path}
          title={info.title}
          text={content.pages[page] ?? DEFAULT_PAGES[page]}
          edited={content.pages[page] !== null}
          facts={facts}
          blocks={blocks}
          inlineHelp={Object.entries(INLINE_TOKENS)}
          blockHelp={Object.entries(BLOCK_TOKENS)}
        />
      </Card>
    </div>
  );
}

export default function ContentSettingsPage({ searchParams }: PageProps<"/admin/settings/content">) {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
