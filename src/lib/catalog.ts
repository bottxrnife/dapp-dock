/**
 * Catalog index of published apps. Canonical data is ENS (name + Walrus pointer)
 * + Walrus (the manifest blob); this in-memory index is a fast cache + the seed
 * set. Resets on a serverless cold start — production would back it with a KV/DB
 * or rebuild it by enumerating ENS subnames.
 */
import { SEED_APPS } from "./seeds";
import type { DappManifest } from "./types";

export type AppRecord = {
  ensName: string;
  name: string;
  description: string;
  category: string;
  requiresWorldId: boolean;
  creator: string;
  manifestBlobId?: string;
  imageBlobId?: string;
  featured?: boolean;
  ts: number;
};

const published: AppRecord[] = [];
const manifests = new Map<string, DappManifest>();
for (const m of SEED_APPS) manifests.set(m.ensName, m);

function toRecord(m: DappManifest, ts: number, blobId?: string, featured?: boolean): AppRecord {
  const imageBlobId = m.storage?.imageBlobId;
  return {
    ensName: m.ensName,
    name: m.name,
    description: m.description,
    category: m.category,
    requiresWorldId: m.permissions.requiresWorldId,
    creator: m.creator,
    manifestBlobId: blobId ?? m.storage?.manifestBlobId,
    imageBlobId,
    // Apps with a cover image always get featured; otherwise the caller decides.
    featured: featured || !!imageBlobId,
    ts,
  };
}

export function listApps(): AppRecord[] {
  // Feature the first few seeds so the catalog rail is never empty.
  const seeds = SEED_APPS.map((m, i) => toRecord(m, 0, undefined, i < 4));
  return [...published, ...seeds];
}

export function addApp(manifest: DappManifest, blobId?: string): void {
  manifests.set(manifest.ensName, manifest);
  published.unshift(toRecord(manifest, Date.now(), blobId));
}

export function getManifest(ensName: string): DappManifest | undefined {
  return manifests.get(ensName);
}
