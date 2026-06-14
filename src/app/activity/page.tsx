"use client";

import { FloatingNav } from "@/components/FloatingNav";
import { Icon } from "@/components/Icon";
import { SparkArt } from "@/components/SparkArt";
import { getActivity, getLoyalty, type ActivityEntry, type LoyaltyRecord } from "@/lib/store";
import Link from "next/link";
import { useEffect, useState } from "react";

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type SparkMeta = { name: string; category?: string };

export default function ActivityPage() {
  const [loyalty, setLoyalty] = useState<Record<string, LoyaltyRecord>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [meta, setMeta] = useState<Record<string, SparkMeta>>({});

  useEffect(() => {
    setLoyalty(getLoyalty());
    setActivity(getActivity());
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, SparkMeta> = {};
        for (const a of d.apps ?? []) m[a.ensName] = { name: a.name, category: a.category };
        setMeta(m);
      })
      .catch(() => {});
  }, []);

  const records = Object.entries(loyalty);
  const totalPoints = records.reduce((s, [, r]) => s + r.points, 0);
  const earningSparks = records.filter(([, r]) => r.points > 0).length;
  const passes = records.filter(([, r]) => r.punches > 0 || r.points > 0);

  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-6">
        <h1 className="display text-[32px] font-extrabold">Activity</h1>

        <div className="mt-5 rounded-[28px] bg-hero p-6 text-hero-fg shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-hero-muted">Total points</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-3 py-1 text-[11px] font-bold text-brand"><Icon name="star" solid size={11} /> Rewards</span>
          </div>
          <p className="display mt-2 text-[56px] font-extrabold leading-none">
            {totalPoints.toLocaleString()}
            <span className="ml-2 text-[20px] font-bold text-brand">pts</span>
          </p>
          <p className="mt-2 text-[13.5px] text-hero-muted">
            Earned across {earningSparks} Spark{earningSparks === 1 ? "" : "s"}
          </p>
        </div>

        <h3 className="display mt-8 text-2xl font-extrabold">Activity</h3>
        {activity.length === 0 ? (
          <div className="mt-3 rounded-3xl bg-wash p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface shadow-soft">
              <Icon name="receipt" size={26} className="text-faint" />
            </div>
            <p className="mt-3 text-sm text-muted">Run a Spark and your receipts show up here.</p>
            <Link
              href="/catalog"
              className="mt-4 inline-flex rounded-full bg-cta px-5 py-2.5 text-sm font-bold text-cta-text"
            >
              Browse Sparks →
            </Link>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {activity.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-wash px-4 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-bold">{e.title}</p>
                    {e.simulated && (
                      <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                        simulated
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {relTime(e.ts)}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {e.amountUsd ? <p className="text-[15px] font-extrabold">${e.amountUsd.toFixed(2)}</p> : null}
                  {e.points ? <p className="text-xs font-bold text-success">+{e.points} pts</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {passes.length > 0 && (
          <>
            <h3 className="display mt-8 text-2xl font-extrabold">Your passes</h3>
            <div className="mt-3 flex flex-col gap-2.5">
              {passes.map(([ens, r]) => (
                <Link
                  key={ens}
                  href={`/app/${encodeURIComponent(ens)}`}
                  className="flex items-center gap-3.5 rounded-3xl bg-wash p-3.5 transition active:scale-[0.98]"
                >
                  <SparkArt ens={ens} category={meta[ens]?.category} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">{meta[ens]?.name ?? ens}</p>
                    <p className="text-[13px] text-muted">
                      {r.punches > 0 ? `${r.punches} stamps` : "Loyalty pass"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[18px] font-extrabold leading-none">{r.points.toLocaleString()}</p>
                    <p className="mt-1 text-[11px] font-semibold text-faint">points</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
      <FloatingNav />
    </>
  );
}
