import { signRequest } from "@worldcoin/idkit-core/signing";
import { NextResponse } from "next/server";

/**
 * Generate the RP signature that proves a World ID request comes from our app.
 * Signed server-side with the RP signing key (never exposed to the client).
 */
export async function POST(req: Request) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const rawKey = process.env.WORLD_SIGNER_PRIVATE_KEY;
  const rpId = process.env.WORLD_RP_ID;
  if (!rawKey || !rpId) {
    return NextResponse.json({ error: "World ID RP not configured" }, { status: 501 });
  }
  const signingKeyHex = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  const act = action || process.env.NEXT_PUBLIC_WORLD_ACTION || "verify-human";

  try {
    const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex, action: act });
    return NextResponse.json({ rp_id: rpId, sig, nonce, created_at: createdAt, expires_at: expiresAt });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
