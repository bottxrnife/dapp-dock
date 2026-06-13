"use client";

import { Button, Card, Pill } from "@/components/ui";
import type { AppRecord } from "@/lib/catalog";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function CatalogPage() {
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => setApps(d.apps ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-16 pt-6">
      <header className="flex items-center gap-3">
        <Button href="/" variant="soft">
          ← Back
        </Button>
        <h1 className="text-xl font-extrabold">Catalog</h1>
      </header>

      {loading && <Card><p className="text-sm text-muted">Loading…</p></Card>}

      {apps.map((a) => (
        <Link key={a.ensName} href={`/app/${encodeURIComponent(a.ensName)}`}>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{a.name}</p>
                <p className="truncate text-xs text-blue-link">{a.ensName}</p>
              </div>
              {a.requiresWorldId ? <Pill tone="green">Human-only</Pill> : <Pill>Open</Pill>}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted">{a.description}</p>
            {a.manifestBlobId && <p className="mt-2 text-[11px] text-faint">on Walrus</p>}
          </Card>
        </Link>
      ))}

      {!loading && apps.length === 0 && (
        <Card>
          <p className="text-sm text-muted">No apps yet. Create the first one.</p>
          <div className="mt-3">
            <Button href="/create">Create an app →</Button>
          </div>
        </Card>
      )}
    </main>
  );
}
