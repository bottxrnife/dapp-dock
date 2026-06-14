import { NextResponse } from "next/server";
import { storeBytes } from "@/lib/walrus";

/**
 * Upload raw bytes (e.g. a Spark's cover image) to Walrus. The client POSTs the
 * file body directly; we return the Walrus blob id so it can be recorded on the
 * manifest (storage.imageBlobId) and read back via /api/blob/{id}.
 */
const MAX_BYTES = 5 * 1024 * 1024; // ~5MB

export async function POST(req: Request) {
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  try {
    const blobId = await storeBytes(bytes);
    return NextResponse.json({ blobId });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
