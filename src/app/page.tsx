"use client";

import { FloatingNav } from "@/components/FloatingNav";
import { appAccent, appEmoji, tint } from "@/lib/appStyle";
import { useAuth } from "@/lib/auth";
import type { AppRecord } from "@/lib/catalog";
import { APP } from "@/lib/config";
import Link from "next/link";
import { useEffect, useState } from "react";

function SparkIcon({ ens, category, size = 60 }: { ens: string; category?: string; size?: number }) {
  const accent = appAccent(ens);
  return (
    <div
      className="flex items-center justify-center rounded-[22px]"
      style={{ width: size, height: size, backgroundColor: tint(accent, 0.14), border: `1px solid ${tint(accent, 0.32)}` }}
    >
      <span style={{ fontSize: size * 0.42 }}>{appEmoji(ens, category)}</span>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [apps, setApps] = useState<AppRecord[]>([]);

  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => setApps(d.apps ?? []))
      .catch(() => {});
  }, []);

  const featured = apps.slice(0, 5);

  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-5">
        {/* header */}
        <div className="flex items-center justify-between">
          <Link
            href="/profile"
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg,#00b4ff,#0066ff)" }}
          >
            <span className="text-sm font-extrabold text-white">{(user?.username ?? "0x")[0]?.toUpperCase()}</span>
          </Link>
          <span className="rounded-full bg-success-bg px-3 py-1.5 text-xs font-bold text-success">
            @{user?.username ?? "human"}
          </span>
        </div>

        <h1 className="display mt-4 text-[34px] font-extrabold leading-none">{APP.name}</h1>
        <p className="mt-2 text-[15px] text-muted">Build a Spark — an app an agent makes for you</p>

        {/* hero — the design agent */}
        <Link
          href="/create"
          className="relative mt-4 block overflow-hidden rounded-[28px] p-6 shadow-pop"
          style={{ background: "linear-gradient(135deg,#00b4ff 0%,#0066ff 100%)" }}
        >
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/25 blur-2xl" />
          <div className="pointer-events-none absolute right-5 top-5 text-3xl">✨</div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">Design agent</p>
          <h2 className="display mt-1.5 text-[26px] font-extrabold leading-tight text-white">Create a Spark</h2>
          <p className="mt-2 max-w-[17rem] text-sm leading-relaxed text-white/90">
            Describe it — an agent builds it, names it on ENS, stores it on Walrus.
          </p>
          <span className="mt-4 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-brand-strong">
            Start building →
          </span>
        </Link>

        {/* Sparks grid */}
        <div className="mt-8 flex items-center justify-between">
          <h3 className="display text-xl font-extrabold">Sparks</h3>
          <Link href="/catalog" className="text-sm font-semibold text-brand-strong">Get more ›</Link>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-x-3 gap-y-4">
          <Link href="/create" className="flex flex-col items-center gap-1.5">
            <div
              className="flex h-[60px] w-[60px] items-center justify-center rounded-[22px] text-white shadow-pop"
              style={{ background: "linear-gradient(135deg,#00b4ff,#0089e6)" }}
            >
              <span className="text-2xl">✨</span>
            </div>
            <span className="w-full truncate text-center text-[11px] font-medium">Create</span>
          </Link>
          {apps.slice(0, 6).map((a) => (
            <Link key={a.ensName} href={`/app/${encodeURIComponent(a.ensName)}`} className="flex flex-col items-center gap-1.5">
              <SparkIcon ens={a.ensName} category={a.category} />
              <span className="w-full truncate text-center text-[11px] font-medium">{a.name}</span>
            </Link>
          ))}
          <Link href="/catalog" className="flex flex-col items-center gap-1.5">
            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-[22px] bg-wash">
              <span className="text-2xl">⋯</span>
            </div>
            <span className="w-full truncate text-center text-[11px] font-medium text-muted">See all</span>
          </Link>
        </div>

        {/* Featured */}
        {featured.length > 0 && (
          <>
            <div className="mt-8 flex items-center justify-between">
              <h3 className="display text-xl font-extrabold">Featured</h3>
              <Link href="/catalog" className="text-sm font-semibold text-brand-strong">See all ›</Link>
            </div>
            <div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: "none" }}>
              {featured.map((a) => (
                <Link key={a.ensName} href={`/app/${encodeURIComponent(a.ensName)}`} className="w-[230px] shrink-0 rounded-3xl bg-wash p-4">
                  <div className="flex items-center justify-between">
                    <SparkIcon ens={a.ensName} category={a.category} size={48} />
                    {a.requiresWorldId && (
                      <span className="rounded-full bg-success-bg px-2 py-1 text-[10px] font-bold text-success">Human-only</span>
                    )}
                  </div>
                  <p className="mt-3 text-[15px] font-bold">{a.name}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-muted">{a.description}</p>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* How it works */}
        <h3 className="display mt-8 text-xl font-extrabold">How it works</h3>
        <div className="mt-3 flex flex-col gap-2.5">
          {[
            ["🧑", "Verified humans", "World ID gates who can create, run, and claim — one per human."],
            ["🏷️", "Named on ENS", `Every Spark gets a ${APP.ensDomain} name and an on-chain identity.`],
            ["🗄️", "Stored on Walrus", "Each Spark's manifest lives on decentralized storage."],
          ].map(([emoji, title, body]) => (
            <div key={title} className="flex items-start gap-3 rounded-2xl bg-wash p-3.5">
              <span className="text-xl">{emoji}</span>
              <div>
                <p className="text-[14px] font-bold">{title}</p>
                <p className="mt-0.5 text-[13px] text-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
      <FloatingNav />
    </>
  );
}
