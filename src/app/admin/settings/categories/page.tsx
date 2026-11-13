import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";
import { Suspense } from "react";
import { Card } from "@/components/form";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { db, schema } from "@/db";
import { groupOf } from "@/domain/category-groups";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { CategoryRow, GroupsEditor } from "./category-forms";

export const metadata: Metadata = { title: "הגדרות: קטגוריות" };

async function Categories() {
  await requireAdmin();
  const { categories, productFamilies: families } = schema;
  const [{ content }, rows, photos] = await Promise.all([
    getSettings(),
    db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        groupId: categories.groupId,
        hidden: categories.hidden,
        homeImage: categories.homeImage,
        images: categories.images,
        count: sql<number>`(SELECT count(*)::int FROM ${families} f WHERE f.category_id = ${categories.id} AND f.status = 'published' AND f.missing_since IS NULL)`,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder)),
    // Photo choices: the first photo of each category's best-ranked families.
    db.execute<{ category_id: string; image: string }>(sql`
      SELECT category_id, image FROM (
        SELECT f.category_id, f.images[1] AS image,
          row_number() OVER (PARTITION BY f.category_id ORDER BY f.pinned_rank ASC NULLS LAST, f.available IS TRUE DESC, f.variant_count DESC) AS n
        FROM ${families} f
        WHERE f.status = 'published' AND f.missing_since IS NULL AND cardinality(f.images) > 0
      ) x WHERE n <= 12`),
  ]);
  const choices = new Map<string, string[]>();
  for (const p of photos.rows) choices.set(p.category_id, [...(choices.get(p.category_id) ?? []), p.image]);
  const groups = content.categoryGroups;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">קבוצות</h2>
          <p className="text-caption text-muted">הקופסאות הגדולות בדף הבית ובחנויות, ושורת הקבוצות בקטלוג. קטגוריות של קבוצה שנמחקה עוברות לקבוצה האחרונה.</p>
        </div>
        <GroupsEditor groups={groups} />
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">קטגוריות ({rows.length})</h2>
          <p className="text-caption text-muted">
            הסדר כאן הוא הסדר בכל האתר. קטגוריה מוסתרת לא מופיעה ברשימות הקטגוריות, והחלקים שלה עדיין נמצאים בחיפוש.
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {rows.map((c, i) => (
            <CategoryRow
              key={c.id}
              category={{ ...c, groupId: groupOf(c.groupId, groups) ?? c.groupId }}
              groups={groups}
              choices={[...new Set([...c.images, ...(choices.get(c.id) ?? [])])].slice(0, 12)}
              first={i === 0}
              last={i === rows.length - 1}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function CategorySettingsPage() {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <Categories />
    </Suspense>
  );
}
