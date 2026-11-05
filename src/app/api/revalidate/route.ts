import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { hasBearer } from "@/lib/bearer";

/**
 * Marks the cached catalog as stale, so pages show the new families, prices and
 * counts. The catalog sync (.github/workflows/sync.yml) calls this when it
 * finishes; it needs the REVALIDATE_SECRET shared by Vercel and GitHub.
 */
export async function POST(request: NextRequest) {
  if (!hasBearer(request.headers.get("authorization"), process.env.REVALIDATE_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Stale-while-revalidate: the next visit gets the old page once while fresh data loads.
  revalidateTag("catalog", "max");
  return Response.json({ revalidated: "catalog" });
}
