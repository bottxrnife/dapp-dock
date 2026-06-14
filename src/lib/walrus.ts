/**
 * Walrus decentralized storage. Each published app's manifest (and, later,
 * media) is written as a Walrus blob; the blob id is recorded on the app's ENS
 * record so the runtime can fetch the canonical manifest from anywhere.
 */
const PUBLISHER = process.env.WALRUS_PUBLISHER_URL || "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || "https://aggregator.walrus-testnet.walrus.space";

/** Store text on Walrus, returning the blob id (handles new + already-certified). */
export async function storeBlob(data: string, epochs = 5): Promise<string> {
  const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    body: data,
  });
  if (!res.ok) throw new Error(`Walrus store failed (${res.status})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const blobId = json?.newlyCreated?.blobObject?.blobId ?? json?.alreadyCertified?.blobId;
  if (!blobId) throw new Error("Walrus: no blobId in response");
  return blobId as string;
}

/** Store raw bytes (e.g. an uploaded image) on Walrus, returning the blob id. */
export async function storeBytes(data: Uint8Array | ArrayBuffer, epochs = 5): Promise<string> {
  const body = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: "PUT",
    body: body as BodyInit,
  });
  if (!res.ok) throw new Error(`Walrus store failed (${res.status})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const blobId = json?.newlyCreated?.blobObject?.blobId ?? json?.alreadyCertified?.blobId;
  if (!blobId) throw new Error("Walrus: no blobId in response");
  return blobId as string;
}

export async function readBlob(blobId: string): Promise<string> {
  const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Walrus read failed (${res.status})`);
  return res.text();
}

export function walrusUrl(blobId: string): string {
  return `${AGGREGATOR}/v1/blobs/${blobId}`;
}
