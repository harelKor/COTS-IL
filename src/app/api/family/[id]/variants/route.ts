import { z } from "zod";
import { cachedJson } from "@/lib/cache-headers";
import { getCardVariants, type CardVariant } from "@/lib/catalog";

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 15;

export type FamilyVariants = { variants: CardVariant[] };

/** A catalog card's variants, loaded on its first "+" so the catalog page stays light. */
export async function GET(_request: Request, { params }: RouteContext<"/api/family/[id]/variants">) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return Response.json({ variants: [] } satisfies FamilyVariants, { status: 404 });
  return cachedJson({ variants: await getCardVariants(id.data) } satisfies FamilyVariants);
}
