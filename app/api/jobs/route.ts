import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs";
import { overLimit, tooMany } from "@/lib/ratelimit";
import { normalizeRows } from "@/lib/normalize";
import { sanitizeBuyBox } from "@/lib/score";

const MAX_ROWS = 500;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rows = body?.rows as Record<string, string>[] | undefined;
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: "No rows uploaded" }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Max ${MAX_ROWS} rows per upload` }, { status: 400 });
  const wait = await overLimit(req, "jobs");
  if (wait) return tooMany(wait);

  let normalized;
  try {
    normalized = normalizeRows(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const { map, leads, duplicates } = normalized;
  const buyBox = sanitizeBuyBox(body.buyBox);
  const id = await createJob(String(body.fileName ?? "upload.csv").slice(0, 200), buyBox, rows.length, map, leads, duplicates);
  return NextResponse.json({ id });
}
