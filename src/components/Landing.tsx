"use client";

import { useAuth } from "@/lib/auth";
import { APP } from "@/lib/config";

/** Shown until the user signs in (or after they cancel the World prompt). */
export function Landing() {
  const { signIn, status, error, inWorldApp } = useAuth();
  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col justify-between px-6 pb-10 pt-16">
      <div>
        <div
          className="flex h-16 w-16 items-center justify-center rounded-3xl"
          style={{ background: "linear-gradient(135deg,#00b4ff 0%,#0066ff 100%)" }}
        >
          <span className="text-3xl">✨</span>
        </div>
        <h1 className="display mt-6 text-5xl font-extrabold">{APP.name}</h1>
        <p className="mt-3 max-w-[20rem] text-lg leading-relaxed text-muted">
          Describe an idea — an agent builds it into a <span className="font-semibold text-ink">Spark</span>: a
          human-only mini experience, named on ENS and stored on Walrus.
        </p>

        <ul className="mt-8 flex flex-col gap-3">
          {[
            ["🧑", "Verified humans only — one per human"],
            ["✨", "Build a Spark by describing it"],
            ["🗄️", "Owned by ENS + Walrus, not a database"],
          ].map(([e, t]) => (
            <li key={t} className="flex items-center gap-3 text-[15px]">
              <span className="text-xl">{e}</span>
              <span className="text-ink/80">{t}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <button
          onClick={signIn}
          disabled={status === "signing"}
          className="w-full rounded-2xl bg-cta px-6 py-4 text-base font-bold text-cta-text disabled:opacity-50"
        >
          {status === "signing" ? "Opening World…" : inWorldApp ? "Sign in with World" : "Preview Forge"}
        </button>
        {error && <p className="mt-3 text-center text-sm font-semibold text-warn">{error}</p>}
        <p className="mt-3 text-center text-xs text-faint">
          {inWorldApp ? "Tap to continue with your World account." : "Open inside World App for the full experience."}
        </p>
      </div>
    </main>
  );
}
