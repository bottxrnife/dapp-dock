"use client";

import { ManifestRunner } from "@/components/ManifestRunner";
import { Button, Card } from "@/components/ui";
import type { DappManifest } from "@/lib/types";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppRun() {
  const params = useParams<{ ens: string }>();
  const ens = decodeURIComponent(String(params.ens));
  const [manifest, setManifest] = useState<DappManifest | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound">("loading");

  useEffect(() => {
    fetch(`/api/app/${encodeURIComponent(ens)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.manifest) {
          setManifest(d.manifest);
          setStatus("ok");
        } else setStatus("notfound");
      })
      .catch(() => setStatus("notfound"));
  }, [ens]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-16 pt-6">
      <header className="flex items-center gap-3">
        <Button href="/catalog" variant="soft">
          ← Back
        </Button>
        <h1 className="truncate text-xl font-extrabold">{manifest?.name ?? "App"}</h1>
      </header>

      {status === "loading" && <Card><p className="text-sm text-muted">Loading…</p></Card>}
      {status === "notfound" && (
        <Card>
          <p className="text-sm text-muted">App not found. It may not be published yet.</p>
        </Card>
      )}
      {status === "ok" && manifest && (
        <>
          <Card>
            <p className="text-xs text-blue-link">{manifest.ensName}</p>
            <p className="mt-1 text-sm text-muted">{manifest.description}</p>
            {manifest.storage?.manifestBlobId && (
              <p className="mt-2 text-[11px] text-faint">manifest on Walrus · {manifest.storage.manifestBlobId.slice(0, 12)}…</p>
            )}
          </Card>
          <Card>
            <ManifestRunner manifest={manifest} />
          </Card>
        </>
      )}
    </main>
  );
}
