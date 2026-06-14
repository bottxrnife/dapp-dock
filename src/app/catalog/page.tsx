"use client";

import { FloatingNav } from "@/components/FloatingNav";
import { appAccent, appEmoji, tint } from "@/lib/appStyle";
import type { AppRecord } from "@/lib/catalog";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

/** Canonical category order — mirrors the agent + appStyle category set. */
const CATEGORIES = ["Finance", "Community", "Agents", "Events", "Tools"] as const;
type Category = (typeof CATEGORIES)[number];
const CHIPS = ["All", ...CATEGORIES] as const;
type Chip = (typeof CHIPS)[number];

/** Cover art for a Spark: its Walrus image if present, else an emoji/accent tile. */
function SparkCover({ a, className, emojiSize }: { a: AppRecord; className: string; emojiSize: number }) {
  if (a.imageBlobId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/blob/${a.imageBlobId}`} alt={`${a.name} cover`} className={`object-cover ${className}`} />
    );
  }
  const accent = appAccent(a.ensName);
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{ backgroundColor: tint(accent, 0.14), border: `1px solid ${tint(accent, 0.32)}` }}
    >
      <span style={{ fontSize: emojiSize }}>{appEmoji(a.ensName, a.category)}</span>
    </div>
  );
}

function SparkCard({ a, featured = false }: { a: AppRecord; featured?: boolean }) {
  return (
    <Link
      href={`/app/${encodeURIComponent(a.ensName)}`}
      className={`flex shrink-0 flex-col bg-wash ${featured ? "w-[230px] rounded-3xl p-3" : "w-[160px] rounded-2xl p-2.5"}`}
    >
      <div className="relative">
        <SparkCover
          a={a}
          className={`w-full ${featured ? "h-[120px] rounded-2xl" : "h-[92px] rounded-xl"}`}
          emojiSize={featured ? 46 : 34}
        />
        {a.requiresWorldId && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-cta/80 px-1.5 py-0.5 text-[9px] font-bold text-cta-text">
            Human
          </span>
        )}
      </div>
      <p className={`mt-2.5 truncate font-bold ${featured ? "text-[15px]" : "text-[13.5px]"}`}>{a.name}</p>
      <p className={`mt-1 line-clamp-2 text-muted ${featured ? "text-[13px]" : "text-[12px] leading-snug"}`}>
        {a.tagline ?? a.description}
      </p>
      {a.stats && (
        <p className="mt-1.5 text-[11.5px] font-semibold text-faint">
          <span className="text-ink">★ {a.stats.rating.toFixed(1)}</span>
          {" · "}
          {a.stats.runs.toLocaleString()} runs
        </p>
      )}
    </Link>
  );
}

/** Edge-to-edge horizontal scroller used by every rail. */
function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: "none" }}>
      {children}
    </div>
  );
}

export default function CatalogPage() {
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [chip, setChip] = useState<Chip>("All");

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => setApps(d.apps ?? []))
      .finally(() => setLoading(false));
  }, []);

  const featured = useMemo(() => {
    const f = apps.filter((a) => a.featured);
    return f.length > 0 ? f : apps.slice(0, 5);
  }, [apps]);

  const sections = useMemo(
    () =>
      CATEGORIES.map((cat) => ({ cat, items: apps.filter((a) => a.category === cat) })).filter(
        (s) => s.items.length > 0,
      ),
    [apps],
  );

  const visible = sections.filter((s) => chip === "All" || s.cat === (chip as Category));

  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-6">
        <h1 className="display text-[30px] font-extrabold">Sparks</h1>
        <p className="mt-1.5 text-[15px] text-muted">Browse human-built Sparks, made with the agent</p>

        {loading && <p className="mt-6 text-sm text-muted">Loading…</p>}

        {!loading && apps.length === 0 && (
          <div className="mt-8 rounded-3xl bg-wash p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-2xl shadow-[0_4px_16px_rgba(11,16,32,0.08)]">
              ✨
            </div>
            <p className="mt-3 text-[15px] font-bold">No Sparks yet</p>
            <p className="mt-1 text-[13px] text-muted">Describe an everyday app and the agent builds it for you.</p>
            <Link
              href="/create"
              className="mt-4 inline-flex rounded-full bg-cta px-5 py-2.5 text-sm font-bold text-cta-text"
            >
              Create a Spark →
            </Link>
          </div>
        )}

        {!loading && apps.length > 0 && (
          <>
            {/* Featured rail */}
            {featured.length > 0 && (
              <section className="mt-5">
                <h3 className="display text-xl font-extrabold">Featured</h3>
                <Rail>
                  {featured.map((a) => (
                    <SparkCard key={a.ensName} a={a} featured />
                  ))}
                </Rail>
              </section>
            )}

            {/* Category chips (sticky to the top while you scroll) */}
            <div className="sticky top-0 z-20 -mx-5 mt-6 bg-bg px-5 py-3">
              <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setChip(c)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      chip === c ? "bg-brand text-white" : "bg-wash text-ink"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* One horizontal rail per category */}
            {visible.map((s) => (
              <section key={s.cat} className="mt-6">
                <div className="flex items-baseline justify-between">
                  <h3 className="display text-xl font-extrabold">{s.cat}</h3>
                  <span className="text-[13px] font-semibold text-muted">
                    {s.items.length} {s.items.length === 1 ? "Spark" : "Sparks"}
                  </span>
                </div>
                <Rail>
                  {s.items.map((a) => (
                    <SparkCard key={a.ensName} a={a} />
                  ))}
                </Rail>
              </section>
            ))}

            {visible.length === 0 && (
              <p className="mt-8 text-center text-sm text-muted">No Sparks in {chip} yet.</p>
            )}
          </>
        )}
      </main>
      <FloatingNav />
    </>
  );
}
