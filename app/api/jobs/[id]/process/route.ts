import { NextResponse } from "next/server";
import { processBatch, UUID } from "@/lib/jobs";

export const maxDuration = 60;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await processBatch(id));
}
