import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { loadJob, UUID } from "@/lib/jobs";
import { sanitizeBuyBox } from "@/lib/score";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const { id } = await params;
  const data = UUID.test(id) ? await loadJob(id) : null;
  return data ? NextResponse.json(data) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Change the buy-box; scores are recomputed on the next read. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const buyBox = sanitizeBuyBox((await req.json().catch(() => null))?.buyBox);
  await sql`update jobs set buy_box = ${JSON.stringify(buyBox)} where id = ${id}`;
  return NextResponse.json({ ok: true });
}
