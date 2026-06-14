"use client";

import { Icon } from "@/components/Icon";
import { Button, Card, Pill } from "@/components/ui";
import { APP } from "@/lib/config";
import type { DappManifest, ManifestComponent } from "@/lib/types";
import { useEffect, useState, type ChangeEvent } from "react";

type EnsProvision = {
  chain: "mainnet" | "sepolia";
  chainLabel: string;
  mode: "on-chain" | "catalog-only";
  ensName: string;
  txHashes?: string[];
  message: string;
};

type PublishResult = {
  ensName: string;
  blobId: string | null;
  walrusUrl: string | null;
  storageError?: string;
  ens?: EnsProvision;
};

export default function PublishPage() {
  const [draft, setDraft] = useState<DappManifest | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [itemUploading, setItemUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("forge.draft");
    if (raw) {
      try {
        setDraft(JSON.parse(raw));
      } catch {}
    }
  }, []);

  const publish = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest: draft, creator: draft.creator }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Publish failed");
      else setResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  async function uploadToWalrus(file: File): Promise<string> {
    const res = await fetch("/api/upload", { method: "POST", body: file });
    const data = await res.json();
    if (!res.ok || !data.blobId) throw new Error(data.error ?? "Upload failed");
    return data.blobId as string;
  }

  function persist(next: DappManifest) {
    setDraft(next);
    try {
      sessionStorage.setItem("forge.draft", JSON.stringify(next));
    } catch {}
  }

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !draft) return;
    setUploading(true);
    setUploadError(null);
    try {
      const blobId = await uploadToWalrus(file);
      persist({ ...draft, storage: { ...draft.storage, imageBlobId: blobId } });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const onPickItemImage = (itemId: string) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !draft) return;
    setItemUploading(itemId);
    setUploadError(null);
    try {
      const blobId = await uploadToWalrus(file);
      persist({
        ...draft,
        components: draft.components.map((c) =>
          c.type === "menu"
            ? { ...c, items: c.items.map((it) => (it.id === itemId ? { ...it, imageBlobId: blobId } : it)) }
            : c,
        ),
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setItemUploading(null);
    }
  };

  if (!draft) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-16 pt-6">
        <Button href="/create" variant="soft">
          ← Back
        </Button>
        <Card>
          <p className="text-sm text-muted">No draft to publish. Create one first.</p>
        </Card>
      </main>
    );
  }

  const menuComp = draft.components.find((c) => c.type === "menu") as
    | Extract<ManifestComponent, { type: "menu" }>
    | undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-16 pt-6">
      <header className="flex items-center gap-3">
        <Button href="/create" variant="soft">
          ← Back
        </Button>
        <h1 className="display text-2xl font-extrabold">Publish</h1>
      </header>

      <Card>
        <div className="flex items-center justify-between">
          <p className="text-base font-extrabold">{draft.name}</p>
          {draft.permissions.requiresWorldId ? <Pill tone="green">Human-only</Pill> : <Pill>Open</Pill>}
        </div>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          <li className="flex justify-between">
            <span className="text-muted">ENS name</span>
            <span className="font-semibold text-blue-link">{draft.ensName}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted">Manifest storage</span>
            <span className="font-semibold">Walrus</span>
          </li>
          <li className="flex justify-between">
            <span className="text-muted">Access</span>
            <span className="font-semibold">{draft.permissions.worldPolicy ?? "open"}</span>
          </li>
        </ul>
      </Card>

      {!result && (
        <Card>
          <p className="text-sm font-bold">Add a cover image (optional)</p>
          <p className="mt-0.5 text-xs text-muted">Stored on Walrus and shown on your Spark.</p>
          {draft.storage?.imageBlobId ? (
            <div className="mt-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/blob/${draft.storage.imageBlobId}`}
                alt="Cover preview"
                className="h-16 w-16 rounded-xl object-cover"
              />
              <label className="cursor-pointer text-xs font-semibold text-blue-link">
                {uploading ? "Uploading…" : "Replace image"}
                <input type="file" accept="image/*" className="hidden" onChange={onPickImage} disabled={uploading} />
              </label>
            </div>
          ) : (
            <label className="mt-3 flex cursor-pointer items-center justify-center rounded-2xl bg-wash px-4 py-6 text-sm font-semibold text-blue-link">
              {uploading ? "Uploading…" : "Choose image"}
              <input type="file" accept="image/*" className="hidden" onChange={onPickImage} disabled={uploading} />
            </label>
          )}
          {uploadError && <p className="mt-2 text-xs font-semibold text-warn">{uploadError}</p>}
        </Card>
      )}

      {!result && menuComp && (
        <Card>
          <p className="text-sm font-bold">Menu photos (optional)</p>
          <p className="mt-0.5 text-xs text-muted">Add a photo to each item — stored on Walrus, shown when ordering.</p>
          <div className="mt-3 flex flex-col gap-2">
            {menuComp.items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-2xl bg-wash px-3 py-2">
                {it.imageBlobId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/blob/${it.imageBlobId}`}
                    alt={it.name}
                    className="h-12 w-12 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-faint">
                    <Icon name="food" size={20} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{it.name}</p>
                  <p className="text-xs text-muted">${it.priceUsd.toFixed(2)}</p>
                </div>
                <label className="shrink-0 cursor-pointer text-xs font-semibold text-blue-link">
                  {itemUploading === it.id ? "Uploading…" : it.imageBlobId ? "Change" : "Add photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickItemImage(it.id)}
                    disabled={itemUploading !== null}
                  />
                </label>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result ? (
        <Card className="!bg-success-bg">
          <p className="text-center text-lg font-extrabold text-success">Published</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li className="flex justify-between gap-2">
              <span className="text-success/70">ENS name</span>
              <span className="font-semibold text-success">{result.ensName}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-success/70">Walrus blob</span>
              <span className="truncate font-semibold text-success">
                {result.blobId ? `${result.blobId.slice(0, 14)}…` : "unavailable"}
              </span>
            </li>
            {result.ens && (
              <>
                <li className="flex justify-between gap-2">
                  <span className="text-success/70">ENS chain</span>
                  <span className="font-semibold text-success">{result.ens.chainLabel}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-success/70">On-chain</span>
                  <span className="font-semibold text-success">
                    {result.ens.mode === "on-chain" ? "Minted" : "Catalog only"}
                  </span>
                </li>
              </>
            )}
          </ul>
          {result.ens?.message && (
            <p className="mt-2 text-center text-xs text-success/80">{result.ens.message}</p>
          )}
          {result.ens?.txHashes?.map((hash) => (
            <a
              key={hash}
              href={
                result.ens!.chain === "mainnet"
                  ? `https://etherscan.io/tx/${hash}`
                  : `https://sepolia.etherscan.io/tx/${hash}`
              }
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-center text-xs text-success/80 underline"
            >
              View ENS tx {hash.slice(0, 10)}…
            </a>
          ))}
          {result.walrusUrl && (
            <a
              href={result.walrusUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-center text-xs text-success/80 underline"
            >
              View manifest on Walrus
            </a>
          )}
          {result.storageError && (
            <p className="mt-2 text-center text-xs text-warn">Walrus unavailable — recorded locally.</p>
          )}
          <div className="mt-3 flex justify-center gap-2">
            <Button href="/catalog" variant="soft">
              View catalog
            </Button>
            <Button href={`/app/${encodeURIComponent(result.ensName)}`}>Open app</Button>
          </div>
        </Card>
      ) : (
        <button
          onClick={publish}
          disabled={busy}
          className="rounded-2xl bg-cta px-5 py-3.5 text-[15px] font-bold text-cta-text disabled:opacity-50"
        >
          {busy ? "Publishing…" : "Confirm publish"}
        </button>
      )}
      {error && <p className="text-center text-xs font-semibold text-warn">{error}</p>}
      <p className="text-center text-xs text-faint">
        {APP.ensChain === "sepolia"
          ? "Publishing stores the manifest on Walrus and auto-mints an ENS subname on Sepolia testnet — free, no ETH from you."
          : "Publishing stores the manifest on Walrus and records the ENS name. Mainnet mints cost real ETH — use Sepolia for free testnet names."}
      </p>
    </main>
  );
}
