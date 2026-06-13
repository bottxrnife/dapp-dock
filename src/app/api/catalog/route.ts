import { NextResponse } from "next/server";
import { listApps } from "@/lib/catalog";

export async function GET() {
  return NextResponse.json({ apps: listApps() });
}
