import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { aiEnabled } from "@/lib/groq";
import type { Row } from "@/lib/jobs";
import { writeOpener } from "@/lib/opener";

export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!aiEnabled()) return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  const [row] = await sql`select id, lead, signals, opener, status from leads where id = ${id}`;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const opener = await writeOpener(row as Row);
  if (!opener) return NextResponse.json({ error: "AI is busy, try again in a moment" }, { status: 503 });
  await sql`update leads set opener = ${opener} where id = ${id}`;
  return NextResponse.json({ opener });
}
