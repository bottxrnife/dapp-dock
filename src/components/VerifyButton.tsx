"use client";

import { APP, hasWorldApp } from "@/lib/config";
import { IDKitRequestWidget, orbLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { useState } from "react";

/**
 * Proof-of-human gate. Inside World App with real creds it runs the IDKit
 * widget (RP signature from our backend, proof verified + nullifier stored
 * server-side). Without creds it falls back to a clearly-labeled simulated
 * verify so the flow still works.
 */
export function VerifyButton({
  action = APP.worldAction,
  signal,
  label = "Verify you're human",
  onVerified,
}: {
  action?: string;
  signal?: string;
  label?: string;
  onVerified: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setErr(null);
    if (!hasWorldApp()) {
      setBusy(true);
      await new Promise((r) => setTimeout(r, 800));
      setBusy(false);
      onVerified();
      return;
    }
    setBusy(true);
    try {
      const sig = await (
        await fetch("/api/rp-signature", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        })
      ).json();
      if (sig.error) throw new Error(sig.error);
      setRpContext({
        rp_id: sig.rp_id,
        nonce: sig.nonce,
        created_at: sig.created_at,
        expires_at: sig.expires_at,
        signature: sig.sig,
      });
      setOpen(true);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={start}
        disabled={busy}
        className="rounded-2xl bg-success px-5 py-3.5 text-[15px] font-bold text-white disabled:opacity-50"
      >
        {busy ? "Verifying…" : label}
      </button>
      {err && <p className="mt-2 text-xs font-semibold text-warn">{err}</p>}
      {rpContext && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={APP.worldAppId as `app_${string}`}
          action={action}
          rp_context={rpContext}
          allow_legacy_proofs
          preset={orbLegacy({ signal })}
          handleVerify={async (result: IDKitResult) => {
            const res = await fetch("/api/verify-proof", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ rp_id: rpContext.rp_id, idkitResponse: result, action }),
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              throw new Error(j.code === "duplicate_nullifier" ? "You've already done this once." : "Verification failed");
            }
          }}
          onSuccess={() => onVerified()}
        />
      )}
    </>
  );
}
