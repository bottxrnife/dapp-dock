import { NextResponse } from "next/server";
import { addApp } from "@/lib/catalog";
import { validateManifest } from "@/lib/manifest";
import { storeBlob, walrusUrl } from "@/lib/walrus";

/**
 * Publish a created app: re-validate the manifest, write it to Walrus, and add
 * it to the catalog under its ENS name. (Real ENS subname minting is the next
 * step; the ENS name + Walrus blob id are recorded here.)
 */
export async function POST(req: Request) {
  const { manifest, creator } = await req.json();
  const v = validateManifest(manifest, creator || manifest?.creator || "a human");
  if (!v.ok) return NextResponse.json({ error: v.errors.join("; ") }, { status: 400 });

  let blobId: string | undefined;
  let storageError: string | undefined;
  try {
    blobId = await storeBlob(JSON.stringify(v.manifest));
  } catch (e) {
    storageError = String(e);
  }

  const stored = { ...v.manifest, storage: { ...v.manifest.storage, manifestBlobId: blobId } };
  addApp(stored, blobId);

  return NextResponse.json({
    ensName: stored.ensName,
    blobId: blobId ?? null,
    walrusUrl: blobId ? walrusUrl(blobId) : null,
    storageError,
  });
}
