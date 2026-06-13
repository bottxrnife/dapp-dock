import { NextResponse } from "next/server";
import { isUsed, markUsed } from "@/lib/nullifiers";

const VERIFY_BASE = "https://developer.world.org/api/v4/verify";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractNullifier(payload: any): string | null {
  return payload?.responses?.[0]?.nullifier ?? payload?.nullifier_hash ?? payload?.nullifier ?? null;
}

/**
 * Verify a World ID proof server-side (Track B): forward the IDKit payload
 * as-is to the v4 verifier, then enforce one-per-human via the nullifier store.
 */
export async function POST(req: Request) {
  const { rp_id, idkitResponse, action } = (await req.json()) as {
    rp_id?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    idkitResponse: any;
    action?: string;
  };
  const rpId = rp_id || process.env.WORLD_RP_ID;
  if (!rpId) return NextResponse.json({ success: false, error: "rp_id missing" }, { status: 400 });

  const res = await fetch(`${VERIFY_BASE}/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResponse),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ success: false, error: "Proof rejected", detail: detail.slice(0, 200) }, { status: 400 });
  }

  const act = action || process.env.NEXT_PUBLIC_WORLD_ACTION || "verify-human";
  const nullifier = extractNullifier(idkitResponse);
  if (nullifier) {
    if (isUsed(act, nullifier)) {
      return NextResponse.json({ success: false, code: "duplicate_nullifier" }, { status: 409 });
    }
    markUsed(act, nullifier);
  }
  return NextResponse.json({ success: true });
}
