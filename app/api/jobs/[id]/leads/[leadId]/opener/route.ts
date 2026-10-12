import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { aiEnabled } from "@/lib/groq";
import { UUID, type Row } from "@/lib/jobs";
import { writeOpener } from "@/lib/opener";
import { overLimit, tooMany } from "@/lib/ratelimit";

// Up to 3 drafts, each possibly waiting out a rate limit.
export const maxDuration = 120;

/** Scoped to the job: a lead is only reachable through its job's unguessable id. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; leadId: string }> }) {
  const { id, leadId } = await params;
  if (!UUID.test(id) || !/^\d+$/.test(leadId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!aiEnabled()) return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  const [row] = await sql`select id, lead, signals, opener, status from leads where id = ${leadId} and job_id = ${id}`;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const wait = await overLimit(req, "opener");
  if (wait) return tooMany(wait);
  const opener = await writeOpener(row as Row);
  if (!opener) return NextResponse.json({ error: "Couldn't write a fact-checked opener right now. Try again in a moment." }, { status: 503 });
  await sql`update leads set opener = ${opener} where id = ${leadId} and job_id = ${id}`;
  return NextResponse.json({ opener });
}
