"use client";

import { FloatingNav } from "@/components/FloatingNav";
import { Icon } from "@/components/Icon";
import { SparkArt } from "@/components/SparkArt";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { APP } from "@/lib/config";
import { getLoyalty } from "@/lib/store";
import { getThemeMode, setThemeMode, type ThemeMode } from "@/lib/theme";
import Link from "next/link";
import { useEffect, useState } from "react";

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: "light", label: "Light", icon: "sun" },
  { mode: "dark", label: "Dark", icon: "moon" },
  { mode: "system", label: "System", icon: "monitor" },
];

// Per-device state cleared by the "Clear local data" row.
const CLEAR_KEYS = ["forge.loyalty", "forge.activity", "forge.orders", "forge.conversations", "forge.home.shortcuts"];

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const [points, setPoints] = useState(0);
  const [passes, setPasses] = useState(0);
  const [mode, setMode] = useState<ThemeMode>("system");
  const [notif, setNotif] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const all = Object.values(getLoyalty());
    setPoints(all.reduce((s, r) => s + r.points, 0));
    setPasses(all.filter((r) => r.punches > 0 || r.points > 0).length);
    setMode(getThemeMode());
    try {
      setNotif(localStorage.getItem("forge.notif") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function selectTheme(m: ThemeMode) {
    setThemeMode(m);
    setMode(m);
  }

  function toggleNotif() {
    const next = !notif;
    setNotif(next);
    try {
      localStorage.setItem("forge.notif", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function clearData() {
    try {
      for (const k of CLEAR_KEYS) localStorage.removeItem(k);
      setPoints(0);
      setPasses(0);
      setCleared(true);
      setTimeout(() => setCleared(false), 2200);
    } catch {
      /* ignore */
    }
  }

  const agentEns = `assistant.agent.${APP.ensDomain}`;

  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-6">
        <h1 className="display text-[32px] font-extrabold">Profile</h1>

        {/* identity + stats */}
        <div className="mt-5 rounded-[28px] bg-ink-panel p-6 text-white shadow-card">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full shadow-pop"
              style={{ background: "linear-gradient(135deg,#00b4ff,#0066ff)" }}
            >
              <span className="display text-2xl font-extrabold text-white">
                {(user?.username ?? "0")[0]?.toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="display truncate text-[22px] font-extrabold leading-tight">@{user?.username ?? "human"}</p>
              <p className="truncate text-[12.5px] text-white/55">
                {user?.guest ? "Preview session" : user?.address}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="display text-[30px] font-extrabold leading-none">{points.toLocaleString()}</p>
              <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">Points</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="display text-[30px] font-extrabold leading-none">{passes}</p>
              <p className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">Passes</p>
            </div>
          </div>
        </div>

        {/* details */}
        <div className="mt-4 flex flex-col gap-3">
          <Link
            href="/identity"
            className="flex items-center gap-3.5 rounded-2xl bg-wash p-4 transition active:scale-[0.98]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
              <Icon name="agent" size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold">Agent identity (ENS)</p>
              <p className="mt-0.5 truncate text-[13px] text-muted">{APP.agentEns}</p>
            </div>
            <Icon name="chevron-right" size={18} className="shrink-0 text-faint" />
          </Link>

          <div className="flex items-center justify-between gap-3 rounded-3xl bg-wash p-4">
            <div className="min-w-0">
              <p className="text-[14.5px] font-bold">World ID</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {user?.guest ? "Preview (not in World App)." : "Proof-of-human is requested per Spark that needs it."}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold ${
                user?.guest ? "bg-warn-bg text-warn" : "bg-success-bg text-success"
              }`}
            >
              {user?.guest ? "Preview" : "Verified"}
            </span>
          </div>

          <div className="flex items-center gap-3.5 rounded-3xl bg-wash p-4">
            <SparkArt ens={agentEns} category="Agents" size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold">Design agent</p>
              <p className="mt-0.5 truncate text-[13px] text-muted">{agentEns}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Button href="/create" variant="brand" className="w-full">
            Create a Spark
          </Button>
          <Button href="/catalog" variant="soft" className="w-full">
            Browse Sparks
          </Button>
        </div>

        {/* settings */}
        <section className="mt-8">
          <h2 className="display text-xl font-extrabold">Settings</h2>

          <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.12em] text-faint">Appearance</p>
          <div className="mt-2 flex rounded-full bg-wash p-1">
            {THEME_OPTIONS.map((opt) => {
              const active = mode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  onClick={() => selectTheme(opt.mode)}
                  aria-pressed={active}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-bold transition active:scale-[0.97] ${
                    active ? "bg-brand text-white shadow-soft" : "text-muted"
                  }`}
                >
                  <Icon name={opt.icon} size={18} />
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-col gap-3">
            <div className="flex items-center gap-3.5 rounded-2xl bg-wash p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
                <Icon name="bell" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-bold">Notifications</p>
                <p className="mt-0.5 text-[13px] text-muted">Run reminders and reward alerts.</p>
              </div>
              <button
                onClick={toggleNotif}
                role="switch"
                aria-checked={notif}
                aria-label="Toggle notifications"
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${notif ? "bg-brand" : "bg-faint"}`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft transition-all ${
                    notif ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            <button
              onClick={clearData}
              className="flex w-full items-center gap-3.5 rounded-2xl bg-wash p-4 text-left transition active:scale-[0.98]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
                <Icon name="trash" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-bold">Clear local data</p>
                <p className="mt-0.5 text-[13px] text-muted">Loyalty, activity, orders &amp; drafts on this device.</p>
              </div>
              {cleared ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-[11px] font-bold text-success">
                  <Icon name="check" size={13} />
                  Cleared
                </span>
              ) : (
                <Icon name="chevron-right" size={18} className="shrink-0 text-faint" />
              )}
            </button>

            <div className="flex items-center gap-3.5 rounded-2xl bg-wash p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-ink">
                <Icon name="info" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-bold">About {APP.name}</p>
                <p className="mt-0.5 text-[13px] text-muted">{APP.tagline}</p>
              </div>
              <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">v1</span>
            </div>
          </div>
        </section>

        <button
          onClick={signOut}
          className="mt-3 w-full rounded-3xl bg-wash py-3.5 text-sm font-bold text-muted transition active:scale-[0.98]"
        >
          Sign out
        </button>
      </main>
      <FloatingNav />
    </>
  );
}
