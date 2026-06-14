"use client";

import { useAuth } from "@/lib/auth";
import { payWorld } from "@/lib/pay";
import { POINTS_REWARDS } from "@/lib/seeds";
import {
  addOrder,
  addPoints,
  getLoyaltyFor,
  getOrders,
  recordActivity,
  spendPoints,
  type OrderRecord,
} from "@/lib/store";
import type { DappManifest, ManifestComponent } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

type Tab = "order" | "rewards" | "history";
type MenuItem = { id: string; name: string; priceUsd: number; desc?: string; tag?: string; imageBlobId?: string };

const short = (a?: string) =>
  a && a.startsWith("0x") ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "guest";

/** Fallback glyph for a menu item with no photo (by name, then by tag). */
function itemEmoji(it: MenuItem): string {
  const n = it.name.toLowerCase();
  const map: [string, string][] = [
    ["burger", "🍔"], ["chicken", "🍗"], ["wrap", "🌯"], ["salad", "🥗"], ["fries", "🍟"],
    ["ring", "🧅"], ["shake", "🥤"], ["lemonade", "🍋"], ["coffee", "☕"], ["brew", "☕"],
    ["latte", "☕"], ["tea", "🍵"], ["pizza", "🍕"], ["taco", "🌮"], ["pastry", "🥐"], ["cake", "🍰"],
  ];
  for (const [k, e] of map) if (n.includes(k)) return e;
  const tag = (it.tag ?? "").toLowerCase();
  if (tag.includes("drink")) return "🥤";
  if (tag.includes("side")) return "🍟";
  if (tag.includes("main")) return "🍔";
  return "🍽️";
}

/** A menu item's thumbnail: its Walrus photo if set, else an emoji tile. */
function ItemThumb({ it }: { it: MenuItem }) {
  if (it.imageBlobId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/blob/${it.imageBlobId}`} alt={it.name} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
    );
  }
  return <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-soft text-[22px]">{itemEmoji(it)}</div>;
}

/**
 * RestaurantApp — the full runtime for any `menu` Spark (e.g. Corner Bistro).
 * A points-based ordering mini-app with Order / Rewards / History tabs and a
 * pickup confirmation, ported from the original DappDock RestaurantApp.
 */
export function RestaurantApp({ manifest }: { manifest: DappManifest }) {
  const ens = manifest.ensName;
  const { user } = useAuth();
  const handle = user?.guest ? "guest" : user?.username ? `@${user.username}` : short(user?.address);

  const menu = manifest.components.find((c) => c.type === "menu") as
    | Extract<ManifestComponent, { type: "menu" }>
    | undefined;
  const recipient = (manifest.components.find((c) => c.type === "recipient") as { value: string } | undefined)?.value;
  const items: MenuItem[] = menu?.items ?? [];
  const currency = menu?.currency ?? "USDC";
  const ppd = menu?.pointsPerDollar ?? 100;
  const rewards = POINTS_REWARDS.filter((r) => r.ens === ens);

  const [tab, setTab] = useState<Tab>("order");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [points, setPoints] = useState(0);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [paying, setPaying] = useState(false);
  const [confirmation, setConfirmation] = useState<OrderRecord | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setPoints(getLoyaltyFor(ens).points);
    setOrders(getOrders().filter((o) => o.ens === ens));
  }, [ens]);

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const remove = (id: string) =>
    setCart((c) => {
      const n = (c[id] ?? 0) - 1;
      const next = { ...c };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = useMemo(() => items.reduce((s, it) => s + it.priceUsd * (cart[it.id] ?? 0), 0), [items, cart]);

  const grouped = useMemo(() => {
    const g: Record<string, MenuItem[]> = {};
    for (const it of items) (g[it.tag ?? "Menu"] ??= []).push(it);
    return Object.entries(g);
  }, [items]);

  async function placeAndPay() {
    if (paying || cartCount === 0) return;
    setPaying(true);
    try {
      const pay = await payWorld({ to: recipient, amountUsd: cartTotal, description: manifest.name });
      const earned = Math.round(cartTotal * ppd);
      const summary = items.filter((it) => cart[it.id]).map((it) => ({ name: it.name, qty: cart[it.id] }));
      const order = addOrder({ ens, items: summary, totalUsd: cartTotal, points: earned, userHandle: handle, simulated: pay.simulated });
      const rec = addPoints(ens, earned);
      recordActivity({
        ens,
        title: `Order · ${manifest.name}`,
        kind: "order",
        amountUsd: cartTotal,
        points: earned,
        note: summary.map((s) => `${s.qty}× ${s.name}`).join(", "),
        simulated: pay.simulated,
      });
      setPoints(rec.points);
      setOrders(getOrders().filter((o) => o.ens === ens));
      setCart({});
      setConfirmation(order);
    } finally {
      setPaying(false);
    }
  }

  function redeem(r: { label: string; cost: number }) {
    if (spendPoints(ens, r.cost)) {
      setPoints(getLoyaltyFor(ens).points);
      recordActivity({ ens, title: `Redeemed · ${r.label}`, kind: "redeem" });
      setFlash(`${r.label} is ready — show this at the counter.`);
    } else {
      setFlash(`Not enough points for ${r.label}.`);
    }
    setTimeout(() => setFlash(null), 2600);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* header: title + live points */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold">{manifest.name}</p>
          <p className="truncate text-[12px] font-semibold text-blue-link">{ens}</p>
        </div>
        <span className="shrink-0 rounded-full bg-ink-panel px-3 py-1.5 text-[12.5px] font-bold text-white">
          ★ {points.toLocaleString()} pts
        </span>
      </div>

      {/* tabs */}
      <div className="flex rounded-full bg-wash p-1">
        {(["order", "rewards", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full py-2 text-[13px] font-bold capitalize transition-colors ${
              tab === t ? "bg-surface text-ink shadow-sm" : "text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {flash && (
        <div className="rounded-2xl bg-success-bg px-4 py-2.5 text-[13px] font-semibold text-success">{flash}</div>
      )}

      {/* ── Order ── */}
      {tab === "order" && (
        <>
          <div className="rounded-2xl bg-blue-soft px-4 py-2.5 text-[12.5px] font-semibold text-blue-body">
            Earn {ppd} points for every $1 — redeem them on the Rewards tab.
          </div>
          {grouped.map(([tag, group]) => (
            <div key={tag} className="flex flex-col gap-2">
              <p className="mt-1 text-[12px] font-bold uppercase tracking-wide text-muted">{tag}</p>
              {group.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 rounded-2xl bg-wash px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <ItemThumb it={it} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold">{it.name}</p>
                      <p className="text-[12px] text-muted">
                        ${it.priceUsd.toFixed(2)}
                        {it.desc ? ` · ${it.desc}` : ""}
                      </p>
                    </div>
                  </div>
                  {cart[it.id] ? (
                    <div className="flex items-center gap-3">
                      <button onClick={() => remove(it.id)} className="h-7 w-7 rounded-full bg-blue-soft text-blue-link">−</button>
                      <span className="w-4 text-center text-sm font-bold">{cart[it.id]}</span>
                      <button onClick={() => add(it.id)} className="h-7 w-7 rounded-full bg-blue-soft text-blue-link">+</button>
                    </div>
                  ) : (
                    <button onClick={() => add(it.id)} className="rounded-full bg-blue-soft px-3.5 py-1.5 text-[13px] font-bold text-blue-link">
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
          <button
            onClick={placeAndPay}
            disabled={cartCount === 0 || paying}
            className="mt-1 rounded-2xl bg-cta px-5 py-3.5 text-[15px] font-bold text-cta-text disabled:opacity-50"
          >
            {paying
              ? "Placing your order…"
              : cartCount === 0
                ? "Add items to your order"
                : `Place order · $${cartTotal.toFixed(2)} (+${Math.round(cartTotal * ppd)} pts)`}
          </button>
        </>
      )}

      {/* ── Rewards ── */}
      {tab === "rewards" && (
        <>
          <div className="rounded-2xl bg-ink-panel p-[18px] text-white">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/55">Your points</p>
            <p className="mt-1 text-[30px] font-extrabold">{points.toLocaleString()}</p>
            <p className="mt-0.5 text-[12.5px] text-white/55">{ppd} points per $1 spent</p>
          </div>
          <p className="mt-1 text-[12px] font-bold uppercase tracking-wide text-muted">Redeem points</p>
          {rewards.map((r) => {
            const enough = points >= r.cost;
            return (
              <div key={r.label} className="flex items-center gap-3 rounded-2xl bg-wash px-4 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-soft text-[19px]">{r.emoji}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold">{r.label}</p>
                  <p className={`text-[12.5px] ${enough ? "text-success" : "text-faint"}`}>
                    {r.cost.toLocaleString()} points
                    {enough ? "" : ` · need ${(r.cost - points).toLocaleString()} more`}
                  </p>
                </div>
                <button
                  onClick={() => redeem(r)}
                  disabled={!enough}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold ${
                    enough ? "bg-cta text-cta-text" : "bg-wash text-faint"
                  }`}
                >
                  {enough ? "Redeem" : "Locked"}
                </button>
              </div>
            );
          })}
          {rewards.length === 0 && <p className="text-[13px] text-muted">No rewards listed yet — keep earning points.</p>}
        </>
      )}

      {/* ── History ── */}
      {tab === "history" && (
        <>
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => setConfirmation(o)}
              className="rounded-2xl bg-wash p-4 text-left"
            >
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-bold">Order #{o.id}</p>
                <p className="text-[14px] font-extrabold">${o.totalUsd.toFixed(2)}</p>
              </div>
              <p className="mt-1 truncate text-[12.5px] text-muted">{o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10.5px] font-bold text-success">+{o.points.toLocaleString()} pts</span>
                <span className="rounded-full bg-blue-soft px-2 py-0.5 text-[10.5px] font-bold text-blue-link">View pickup code</span>
                {o.simulated && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[10.5px] font-bold text-warn">Simulated</span>}
              </div>
            </button>
          ))}
          {orders.length === 0 && (
            <div className="rounded-2xl bg-wash p-6 text-center">
              <p className="text-2xl">🧾</p>
              <p className="mt-2 text-[14px] font-bold">No orders yet</p>
              <p className="mt-1 text-[12.5px] text-muted">Place an order and it shows up here with a pickup code.</p>
            </div>
          )}
        </>
      )}

      {/* pickup confirmation */}
      {confirmation && (
        <div
          onClick={() => setConfirmation(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl bg-surface p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-2xl font-bold text-success">✓</div>
            <p className="mt-3 text-[19px] font-extrabold">Order confirmed</p>
            <p className="mt-1 text-[13px] text-muted">Show this pickup code at the counter.</p>

            <div className="mx-auto mt-4 rounded-2xl bg-ink-panel px-6 py-4 text-white">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/55">Pickup code</p>
              <p className="mt-1 font-mono text-[22px] font-extrabold tracking-widest">{confirmation.id}</p>
            </div>
            <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-faint">Pickup for</p>
            <p className="truncate text-[15px] font-extrabold">{confirmation.userHandle ?? handle}</p>
            <p className="text-[12.5px] font-semibold text-blue-link">+{confirmation.points.toLocaleString()} pts earned</p>

            <div className="mt-4 rounded-2xl bg-wash p-4 text-left">
              {confirmation.items.map((it) => (
                <div key={it.name} className="flex justify-between py-0.5 text-[13px] text-muted">
                  <span>{it.qty}× {it.name}</span>
                </div>
              ))}
              <div className="my-2 h-px bg-divider" />
              <div className="flex justify-between text-[13.5px] font-bold">
                <span>Total</span>
                <span>${confirmation.totalUsd.toFixed(2)} {currency}</span>
              </div>
            </div>

            <button
              onClick={() => {
                setConfirmation(null);
                setTab("history");
              }}
              className="mt-5 w-full rounded-2xl bg-cta px-5 py-3.5 text-[15px] font-bold text-cta-text"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
