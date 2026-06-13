import { NextResponse } from "next/server";
import { getManifest } from "@/lib/catalog";

export async function GET(_req: Request, { params }: { params: Promise<{ ens: string }> }) {
  const { ens } = await params;
  const manifest = getManifest(ens);
  if (!manifest) return NextResponse.json({ error: "App not found" }, { status: 404 });
  return NextResponse.json({ manifest });
}
