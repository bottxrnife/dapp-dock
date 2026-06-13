"use client";

import { Pill } from "@/components/ui";
import { VerifyButton } from "@/components/VerifyButton";
import type { DappManifest, ManifestComponent } from "@/lib/types";
import { useMemo, useState } from "react";

/**
 * Renders a manifest's components and runs its workflow. World ID + real World
 * wallet payment are wired in later phases; for now a run walks the workflow
 * steps and shows a clearly-labeled simulated settle.
 */
export function ManifestRunner({ manifest }: { manifest: DappManifest }) {
  const [memo, setMemo] = useState(
    (manifest.components.find((c) => c.type === "memoInput") as { default: string } | undefined)?.default ?? ""
  );
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<number>(-1); // -1 idle, 0..n running, n = done
  const [verified, setVerified] = useState(!manifest.permissions.requiresWorldId);
  const menu = manifest.components.find((c) => c.type === "menu") as
    | Extract<ManifestComponent, { type: "menu" }>
    | undefined;
  const amountComp = manifest.components.find((c) => c.type === "amountInput") as
    | Extract<ManifestComponent, { type: "amountInput" }>
    | undefined;

  const total = useMemo(() => {
    if (menu) return menu.items.reduce((s, it) => s + (cart[it.id] ?? 0) * it.priceUsd, 0);
    return parseFloat(amountComp?.default ?? "0") || 0;
  }, [menu, cart, amountComp]);

  const submitLabel =
    (manifest.components.find((c) => c.type === "submitButton") as { label: string } | undefined)?.label ?? "Run";

  const run = async () => {
    for (let i = 0; i < manifest.workflow.steps.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 650));
    }
    setStep(manifest.workflow.steps.length);
  };

  const done = step >= manifest.workflow.steps.length;

  return (
    <div className="flex flex-col gap-3">
      {/* outcome */}
      <div className="rounded-2xl bg-blue-soft px-4 py-3 text-sm font-semibold text-blue-body">
        {manifest.outcome}
      </div>

      {manifest.permissions.requiresWorldId && (
        <Pill tone="green">World ID · {manifest.permissions.worldPolicy ?? "one per human"}</Pill>
      )}

      {/* components */}
      {amountComp && !menu && (
        <Row label="Amount">
          <span className="font-bold">${amountComp.default}</span> <span className="text-muted">{amountComp.token}</span>
        </Row>
      )}
      {manifest.components.map((c, i) => {
        if (c.type === "recipient") return <Row key={i} label="To">{c.value}</Row>;
        if (c.type === "memoInput")
          return (
            <Row key={i} label="Memo">
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full bg-transparent text-right outline-none"
              />
            </Row>
          );
        if (c.type === "punchCard")
          return (
            <div key={i} className="rounded-2xl bg-[#16204a] p-4 text-white">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Loyalty card</span>
                <span className="text-xs text-white/70">Reward: {c.reward}</span>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {Array.from({ length: c.total }).map((_, k) => (
                  <div
                    key={k}
                    className="flex aspect-square items-center justify-center rounded-lg bg-white/10 text-xs"
                  >
                    {k === 0 ? "★" : ""}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-white/60">{c.pointsPerDollar} pts per $1</p>
            </div>
          );
        if (c.type === "menu")
          return (
            <div key={i} className="flex flex-col gap-2">
              {c.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
                  <div>
                    <p className="text-sm font-bold">{it.name}</p>
                    <p className="text-xs text-muted">${it.priceUsd.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setCart((p) => ({ ...p, [it.id]: Math.max(0, (p[it.id] ?? 0) - 1) }))}
                      className="h-7 w-7 rounded-full bg-blue-soft text-blue-link"
                    >
                      −
                    </button>
                    <span className="w-4 text-center text-sm font-bold">{cart[it.id] ?? 0}</span>
                    <button
                      onClick={() => setCart((p) => ({ ...p, [it.id]: (p[it.id] ?? 0) + 1 }))}
                      className="h-7 w-7 rounded-full bg-blue-soft text-blue-link"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        return null;
      })}

      {/* run / timeline / done */}
      {step === -1 && !verified && (
        <VerifyButton signal={manifest.ensName} onVerified={() => setVerified(true)} />
      )}
      {step === -1 && verified && (
        <button
          onClick={run}
          disabled={total <= 0 && !!(menu || amountComp)}
          className="mt-1 rounded-2xl bg-cta px-5 py-3.5 text-[15px] font-bold text-cta-text disabled:opacity-50"
        >
          {submitLabel}
          {total > 0 ? ` · $${total.toFixed(2)}` : ""}
        </button>
      )}

      {step >= 0 && !done && (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
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
          <p className="text-lg font-extrabold text-success">Done</p>
          <p className="mt-1 text-sm text-success/80">Simulated settle. Real World-wallet payment lands next.</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right">{children}</span>
    </div>
  );
}
