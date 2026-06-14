/**
 * Stream a Walrus blob (e.g. a Spark cover image) back to the client. Proxying
 * through our own origin lets <img src="/api/blob/{id}"> render without CORS or
 * exposing the aggregator URL. Blobs are immutable, so cache them aggressively.
 */
const AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL || "https://aggregator.walrus-testnet.walrus.space";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const upstream = await fetch(`${AGGREGATOR}/v1/blobs/${id}`);
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: 404 });
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
