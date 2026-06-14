"use client";

import { FloatingNav } from "@/components/FloatingNav";
import { appAccent, appEmoji, tint } from "@/lib/appStyle";
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

export default function ActivityPage() {
  const [loyalty, setLoyalty] = useState<Record<string, LoyaltyRecord>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoyalty(getLoyalty());
    setActivity(getActivity());
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, string> = {};
        for (const a of d.apps ?? []) m[a.ensName] = a.name;
        setNames(m);
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
        <h1 className="display text-[30px] font-extrabold">Activity</h1>

        <div className="mt-4 rounded-3xl bg-ink-panel p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-white/60">Total points</p>
          <p className="mt-1 text-4xl font-extrabold">{totalPoints.toLocaleString()}</p>
          <p className="mt-1 text-sm text-white/70">
            Earned across {earningSparks} Spark{earningSparks === 1 ? "" : "s"}
          </p>
        </div>

        <h3 className="display mt-6 text-xl font-extrabold">Activity</h3>
        {activity.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-wash p-6 text-center">
            <p className="text-sm text-muted">Run a Spark and your receipts show up here.</p>
            <Link
              href="/catalog"
              className="mt-4 inline-flex rounded-full bg-cta px-5 py-2.5 text-sm font-bold text-cta-text"
            >
              Browse Sparks →
            </Link>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {activity.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-wash px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{e.title}</p>
                    {e.simulated && (
                      <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                        simulated
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {relTime(e.ts)}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {e.amountUsd ? <p className="text-sm font-bold">${e.amountUsd.toFixed(2)}</p> : null}
                  {e.points ? <p className="text-xs text-success">+{e.points} pts</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {passes.length > 0 && (
          <>
            <h3 className="display mt-6 text-xl font-extrabold">Your passes</h3>
            <div className="mt-3 flex flex-col gap-2.5">
              {passes.map(([ens, r]) => {
                const accent = appAccent(ens);
                return (
                  <Link
                    key={ens}
                    href={`/app/${encodeURIComponent(ens)}`}
                    className="flex items-center gap-3.5 rounded-2xl bg-wash p-3.5"
                  >
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]"
                      style={{ backgroundColor: tint(accent, 0.14), border: `1px solid ${tint(accent, 0.32)}` }}
                    >
                      <span className="text-xl">{appEmoji(ens)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">{names[ens] ?? ens}</p>
                      <p className="text-[13px] text-muted">
                        {r.punches > 0 ? `${r.punches} stamps · ` : ""}
                        {r.points.toLocaleString()} points
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>
      <FloatingNav />
    </>
  );
}
