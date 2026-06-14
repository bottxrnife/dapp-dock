"use client";

import { Pill } from "@/components/ui";
import { VerifyButton } from "@/components/VerifyButton";
import { appEmoji } from "@/lib/appStyle";
import { payWorld } from "@/lib/pay";
import { addOrder, addPoints, addStamp, getLoyaltyFor, recordActivity, redeemReward, type LoyaltyRecord } from "@/lib/store";
import type { DappManifest, ManifestComponent } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";

type Done = { simulated: boolean; pointsEarned: number; punches?: number; total?: number; orderId?: string; redeemed?: boolean } | null;

export function ManifestRunner({ manifest }: { manifest: DappManifest }) {
  const ens = manifest.ensName;
  const menu = manifest.components.find((c) => c.type === "menu") as Extract<ManifestComponent, { type: "menu" }> | undefined;
  const amountComp = manifest.components.find((c) => c.type === "amountInput") as Extract<ManifestComponent, { type: "amountInput" }> | undefined;
  const recipientComp = manifest.components.find((c) => c.type === "recipient") as Extract<ManifestComponent, { type: "recipient" }> | undefined;
  const punch = manifest.components.find((c) => c.type === "punchCard") as Extract<ManifestComponent, { type: "punchCard" }> | undefined;
  const memoComp = manifest.components.find((c) => c.type === "memoInput") as Extract<ManifestComponent, { type: "memoInput" }> | undefined;
  const submitLabel = (manifest.components.find((c) => c.type === "submitButton") as { label: string } | undefined)?.label ?? "Run";

  const [loyalty, setLoyalty] = useState<LoyaltyRecord>({ punches: 0, points: 0, redeemed: 0 });
  const [memo, setMemo] = useState(memoComp?.default ?? "");
  const [amount, setAmount] = useState(amountComp?.default ?? "");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [verified, setVerified] = useState(!manifest.permissions.requiresWorldId);
  const [step, setStep] = useState(-1); // -1 idle, 0..n running
  const [done, setDone] = useState<Done>(null);

  useEffect(() => {
    setLoyalty(getLoyaltyFor(ens));
  }, [ens]);

  const cardFull = !!punch && loyalty.punches >= punch.total;

  const total = useMemo(() => {
    if (menu) return menu.items.reduce((s, it) => s + (cart[it.id] ?? 0) * it.priceUsd, 0);
    return parseFloat(amount || amountComp?.default || "0") || 0;
  }, [menu, cart, amount, amountComp]);

  const stepsN = manifest.workflow.steps.length;

  async function settle() {
    // pay (real World wallet if available + 0x recipient, else simulated)
    const pay = await payWorld({ to: recipientComp?.value, amountUsd: total, description: manifest.name });
    for (let i = 0; i < stepsN; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 550));
    }
    return pay;
  }

  async function run() {
    const pay = await settle();
    let pointsEarned = 0;
    let rec: LoyaltyRecord | undefined;
    let orderId: string | undefined;

    if (punch) {
      pointsEarned = Math.round(total * punch.pointsPerDollar);
      rec = addStamp(ens, pointsEarned, punch.total);
      setLoyalty(rec);
    } else if (menu) {
      pointsEarned = Math.round(total * (menu.pointsPerDollar ?? 0));
      if (pointsEarned) rec = addPoints(ens, pointsEarned);
      const items = menu.items.filter((it) => (cart[it.id] ?? 0) > 0).map((it) => ({ name: it.name, qty: cart[it.id] ?? 0 }));
      const order = addOrder({ ens, items, totalUsd: total, points: pointsEarned });
      orderId = order.id;
    }

    recordActivity({
      ens,
      title: menu ? `Order · ${manifest.name}` : manifest.name,
      kind: menu ? "order" : total > 0 ? "purchase" : "claim",
      amountUsd: total || undefined,
      points: pointsEarned || undefined,
      note: memo || undefined,
      simulated: pay.simulated,
    });

    setStep(stepsN);
    setDone({ simulated: pay.simulated, pointsEarned, punches: rec?.punches, total: punch?.total, orderId });
  }

  async function redeem() {
    setStep(0);
    await new Promise((r) => setTimeout(r, 700));
    const rec = redeemReward(ens);
    setLoyalty(rec);
    recordActivity({ ens, title: `Redeemed · ${punch?.reward}`, kind: "redeem" });
    setStep(stepsN);
    setDone({ simulated: true, pointsEarned: 0, redeemed: true });
  }

  return (
    <div className="flex flex-col gap-3">
      {manifest.storage?.imageBlobId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/blob/${manifest.storage.imageBlobId}`}
          alt={`${manifest.name} cover`}
          className="h-28 w-full rounded-2xl object-cover"
        />
      )}
      <div className="rounded-2xl bg-blue-soft px-4 py-3 text-sm font-semibold text-blue-body">{manifest.outcome}</div>
      {manifest.permissions.requiresWorldId && (
        <Pill tone="green">World ID · {manifest.permissions.worldPolicy ?? "one per human"}</Pill>
      )}

      {/* punch card */}
      {punch && (
        <div className="rounded-2xl bg-[#16204a] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{loyalty.punches}/{punch.total} stamps</span>
            <span className="text-xs text-white/70">{punch.reward}</span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {Array.from({ length: punch.total }).map((_, k) => (
              <div
                key={k}
                className={`flex aspect-square items-center justify-center rounded-lg text-xs ${k < loyalty.punches ? "bg-white/90" : "bg-white/10"}`}
              >
                {k < loyalty.punches ? appEmoji(ens, manifest.category) : ""}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/60">{loyalty.points} pts · {punch.pointsPerDollar} per $1</p>
        </div>
      )}

      {/* menu cart */}
      {menu &&
        menu.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-2xl bg-wash px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold">{it.name}</p>
              <p className="text-xs text-muted">${it.priceUsd.toFixed(2)}{it.desc ? ` · ${it.desc}` : ""}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setCart((p) => ({ ...p, [it.id]: Math.max(0, (p[it.id] ?? 0) - 1) }))} className="h-7 w-7 rounded-full bg-blue-soft text-blue-link">−</button>
              <span className="w-4 text-center text-sm font-bold">{cart[it.id] ?? 0}</span>
              <button onClick={() => setCart((p) => ({ ...p, [it.id]: (p[it.id] ?? 0) + 1 }))} className="h-7 w-7 rounded-full bg-blue-soft text-blue-link">+</button>
            </div>
          </div>
        ))}

      {/* amount */}
      {amountComp && !menu && (
        <Row label="Amount">
          {amountComp.locked ? (
            <span><span className="font-bold">${amountComp.default}</span> <span className="text-muted">{amountComp.token}</span></span>
          ) : (
            <span className="flex items-center justify-end gap-1">
              $<input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="w-16 bg-transparent text-right font-bold outline-none" />
              <span className="text-muted">{amountComp.token}</span>
            </span>
          )}
        </Row>
      )}
      {recipientComp && <Row label="To">{recipientComp.value}</Row>}
      {memoComp && (
        <Row label="Memo">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className="w-full bg-transparent text-right outline-none" />
        </Row>
      )}

      {/* action zone */}
      {step === -1 && !done && (
        <>
          {!verified ? (
            <VerifyButton signal={ens} onVerified={() => setVerified(true)} />
          ) : cardFull ? (
            <button onClick={redeem} className="rounded-2xl bg-success px-5 py-3.5 text-[15px] font-bold text-white">
              Redeem {punch?.reward} (free)
            </button>
          ) : (
            <button
              onClick={run}
              disabled={(menu || (amountComp && !amountComp.locked)) ? total <= 0 : false}
              className="rounded-2xl bg-cta px-5 py-3.5 text-[15px] font-bold text-cta-text disabled:opacity-50"
            >
              {submitLabel}
              {total > 0 ? ` · $${total.toFixed(2)}` : ""}
            </button>
          )}
        </>
      )}

      {step >= 0 && !done && (
        <div className="flex flex-col gap-2 rounded-2xl bg-wash p-4">
          {manifest.workflow.steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <span className={i <= step ? "text-success" : "text-faint"}>{i < step ? "✓" : i === step ? "○" : "·"}</span>
              <span className={i <= step ? "font-semibold" : "text-faint"}>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {done && (
        <div className="rounded-2xl bg-success-bg p-4 text-center">
          <p className="text-lg font-extrabold text-success">{done.redeemed ? "Reward redeemed" : "Done"}</p>
          {done.pointsEarned > 0 && <p className="mt-1 text-sm text-success/80">+{done.pointsEarned} points earned</p>}
          {done.punches != null && done.total != null && (
            <p className="mt-0.5 text-sm text-success/80">{done.punches}/{done.total} stamps</p>
          )}
          {done.orderId && <p className="mt-0.5 text-sm text-success/80">Pickup code: {done.orderId}</p>}
          <p className="mt-1 text-xs text-success/70">{done.simulated ? "Simulated settle (fund a World wallet to pay for real)." : "Settled in your World wallet."}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-wash px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right">{children}</span>
    </div>
  );
}
