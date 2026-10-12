import { NextResponse } from "next/server";
import { processBatch, UUID } from "@/lib/jobs";

// A batch is 6 sites in parallel; slow sites + AI retries can pass a minute.
export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await processBatch(id));
}
