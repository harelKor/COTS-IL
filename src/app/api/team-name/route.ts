import { and, eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { lookUpTeamName } from "@/lib/auth-providers";
import { parseTeamNumber } from "@/domain/teams";

export type TeamNameResponse = { name: string | null; registered: boolean };

/** For the cart sheet's team step: is the number already registered here, and what is the team called. */
export async function GET(request: NextRequest) {
  const program = request.nextUrl.searchParams.get("program") === "FTC" ? "FTC" : "FRC";
  const number = parseTeamNumber(request.nextUrl.searchParams.get("number"));
  if (number === null) return Response.json({ name: null, registered: false } satisfies TeamNameResponse);
  const existing = await db.query.teams.findFirst({ where: and(eq(schema.teams.program, program), eq(schema.teams.number, number)) });
  if (existing) return Response.json({ name: existing.name, registered: true } satisfies TeamNameResponse);
  return Response.json({ name: await lookUpTeamName(program, number), registered: false } satisfies TeamNameResponse);
}
