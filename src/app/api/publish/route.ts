import { NextResponse } from "next/server";
import { addApp } from "@/lib/catalog";
import { provisionSparkEns } from "@/lib/ensPublish";
import { validateManifest } from "@/lib/manifest";
import { storeBlob, walrusUrl } from "@/lib/walrus";

/**
 * Publish a Spark: validate → Walrus → catalog → auto-mint ENS subname (Sepolia
 * by default, free) when ENS_REGISTRAR_PRIVATE_KEY is configured.
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

  const ens =
    blobId != null
      ? await provisionSparkEns(stored, blobId, walrusUrl(blobId))
      : {
          chain: "sepolia" as const,
          chainLabel: "Sepolia testnet (free)",
          mode: "catalog-only" as const,
          ensName: stored.ensName,
          message: "Walrus unavailable — ENS records skipped until manifest is stored.",
        };

  return NextResponse.json({
    ensName: stored.ensName,
    blobId: blobId ?? null,
    walrusUrl: blobId ? walrusUrl(blobId) : null,
    storageError,
    ens,
  });
}
