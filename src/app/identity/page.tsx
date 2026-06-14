"use client";

import { FloatingNav } from "@/components/FloatingNav";
import { Icon } from "@/components/Icon";
import { SparkArt } from "@/components/SparkArt";
import { useAuth } from "@/lib/auth";
import { APP } from "@/lib/config";
import { useEffect, useState, type FormEvent } from "react";

/* ---- Types mirroring the live /api/ens responses (nothing hard-coded) ---- */
type AgentInfo = {
  context: string | null;
  endpoints: { mcp?: string; a2a?: string; web?: string };
  hasRecords: boolean;
};
type EnsProfile = {
  name: string;
  address: string | null;
  resolver: string | null;
  avatar: string | null;
  records: Record<string, string>;
  agent: AgentInfo;
  verified: boolean;
};
type ProfileResponse =
  | { profile: EnsProfile; registration: unknown }
  | { profile: null; address: string; primary: null }
  | { error: string };
type Calldata = { to: string; data: string; value: string; summary: string; chainId: number };
type CalldataResponse = Calldata | { error: string };

type Loadable<T> = { loading: boolean; error: string | null; data: T | null };

const SIGNER_URL = "https://transact.swiss-knife.xyz/send-tx";

const ENDPOINT_META = [
  { key: "mcp", label: "MCP", icon: "database" },
  { key: "a2a", label: "A2A", icon: "swap" },
  { key: "web", label: "Web", icon: "tag" },
] as const;

const inputCls =
  "w-full rounded-2xl bg-wash px-4 py-3 text-[14.5px] text-ink outline-none transition placeholder:text-faint focus:ring-2 focus:ring-brand/40";

function short(addr?: string | null): string {
  if (!addr) return "";
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

async function fetchProfile(qs: string): Promise<ProfileResponse> {
  const res = await fetch(`/api/ens/profile?${qs}`);
  return (await res.json()) as ProfileResponse;
}

/* ---- Small shared pieces ---- */
function VerifiedPill({ verified, dark = false }: { verified: boolean; dark?: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-[11px] font-bold text-success">
        <Icon name="check" size={13} />
        Verified
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
        dark ? "bg-white/10 text-white/55" : "bg-wash text-muted"
      }`}
    >
      Unverified
    </span>
  );
}

function Skeleton({ dark = false }: { dark?: boolean }) {
  const bar = dark ? "bg-white/10" : "bg-wash";
  return (
    <div className="mt-4 animate-pulse space-y-2.5">
      <div className={`h-4 w-1/2 rounded-full ${bar}`} />
      <div className={`h-3 w-3/4 rounded-full ${bar}`} />
      <div className={`h-3 w-2/3 rounded-full ${bar}`} />
    </div>
  );
}

/** ENSIP-26 agent records (context + endpoints), light or dark surface. */
function AgentRecordsView({ agent, tone = "light" }: { agent: AgentInfo; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  const label = dark ? "text-white/55" : "text-faint";
  const body = dark ? "text-white/85" : "text-ink";
  const muted = dark ? "text-white/45" : "text-muted";
  const rowBg = dark ? "bg-white/5" : "bg-wash";
  const iconTone = dark ? "text-white/70" : "text-brand-strong";

  if (!agent.hasRecords) {
    return (
      <p className={`mt-3 text-[13px] leading-relaxed ${muted}`}>
        No agent records on-chain yet — set them with “Name an agent” below.
      </p>
    );
  }

  const eps = ENDPOINT_META.filter((e) => agent.endpoints[e.key]);
  return (
    <div className="mt-3">
      <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${label}`}>ENSIP-26 agent records</p>
      {agent.context && (
        <p className={`mt-2 line-clamp-5 whitespace-pre-wrap text-[13.5px] leading-relaxed ${body}`}>{agent.context}</p>
      )}
      {eps.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {eps.map((e) => (
            <a
              key={e.key}
              href={agent.endpoints[e.key]}
              target="_blank"
              rel="noreferrer"
              className={`flex items-start gap-2.5 rounded-xl ${rowBg} px-3 py-2.5`}
            >
              <Icon name={e.icon} size={16} className={`mt-0.5 shrink-0 ${iconTone}`} />
              <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide ${muted}`}>{e.label}</span>
              <span className={`min-w-0 flex-1 break-all text-[12.5px] ${body}`}>{agent.endpoints[e.key]}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** Avatar (live ENS avatar) or a generated SparkArt fallback. */
function Avatar({ profile, size }: { profile: EnsProfile; size: number }) {
  if (profile.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatar}
        alt={profile.name}
        className="shrink-0 rounded-2xl object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return <SparkArt ens={profile.name} size={size} />;
}

/** A full resolved-profile card (reused by the explorer + the post-sign refresh). */
function ResultCard({ profile }: { profile: EnsProfile }) {
  const recordKeys = Object.keys(profile.records);
  return (
    <div className="mt-3 rounded-3xl bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-3.5">
        <Avatar profile={profile} size={48} />
        <div className="min-w-0 flex-1">
          <p className="display truncate text-[18px] font-extrabold leading-tight">{profile.name}</p>
          <p className="truncate font-mono text-[12px] text-muted">{short(profile.address) || "No address record"}</p>
        </div>
        <VerifiedPill verified={profile.verified} />
      </div>

      {recordKeys.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {recordKeys.map((k) => (
            <div key={k} className="rounded-xl bg-wash px-3.5 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-faint">{k}</p>
              <p className="mt-0.5 break-words text-[13px] text-ink">{profile.records[k]}</p>
            </div>
          ))}
        </div>
      )}

      {profile.resolver && (
        <p className="mt-3 truncate font-mono text-[11px] text-faint">resolver {short(profile.resolver)}</p>
      )}

      {profile.agent.hasRecords && (
        <div className="mt-4 border-t border-divider pt-4">
          <AgentRecordsView agent={profile.agent} />
        </div>
      )}
    </div>
  );
}

function SectionHeader({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="display flex items-center gap-2 text-[20px] font-extrabold">
        <Icon name={icon} size={20} className="text-brand" />
        {title}
      </h2>
      {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-bold text-muted">{label}</span>
      {children}
    </label>
  );
}

export default function IdentityPage() {
  const { user } = useAuth();

  const [agent, setAgent] = useState<Loadable<EnsProfile>>({ loading: true, error: null, data: null });
  const [mine, setMine] = useState<{ loading: boolean; profile: EnsProfile | null; checked: boolean }>({
    loading: false,
    profile: null,
    checked: false,
  });

  // Live ENS explorer
  const [query, setQuery] = useState("");
  const [resolved, setResolved] = useState<Loadable<EnsProfile>>({ loading: false, error: null, data: null });

  // Name an agent (write → calldata)
  const [formName, setFormName] = useState("");
  const [formContext, setFormContext] = useState("");
  const [formMcp, setFormMcp] = useState("");
  const [formA2a, setFormA2a] = useState("");
  const [formWeb, setFormWeb] = useState("");
  const [gen, setGen] = useState<Loadable<Calldata>>({ loading: false, error: null, data: null });
  const [copied, setCopied] = useState(false);
  const [refresh, setRefresh] = useState<Loadable<EnsProfile>>({ loading: false, error: null, data: null });

  // Forge agent — read live ENSIP-26 records on mount.
  useEffect(() => {
    let cancelled = false;
    setAgent({ loading: true, error: null, data: null });
    fetchProfile(`name=${encodeURIComponent(APP.agentEns)}`)
      .then((json) => {
        if (cancelled) return;
        if ("error" in json) setAgent({ loading: false, error: json.error, data: null });
        else if (!json.profile) setAgent({ loading: false, error: "Agent name not set yet.", data: null });
        else setAgent({ loading: false, error: null, data: json.profile });
      })
      .catch(() => {
        if (!cancelled) setAgent({ loading: false, error: "Couldn’t reach ENS.", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Your identity — reverse-resolve the connected World wallet to its primary name.
  useEffect(() => {
    if (!user?.address || user.guest) {
      setMine({ loading: false, profile: null, checked: false });
      return;
    }
    let cancelled = false;
    setMine({ loading: true, profile: null, checked: false });
    fetchProfile(`address=${encodeURIComponent(user.address)}`)
      .then((json) => {
        if (cancelled) return;
        if ("error" in json) setMine({ loading: false, profile: null, checked: true });
        else setMine({ loading: false, profile: json.profile ?? null, checked: true });
      })
      .catch(() => {
        if (!cancelled) setMine({ loading: false, profile: null, checked: true });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.address, user?.guest]);

  async function onResolve(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setResolved({ loading: true, error: null, data: null });
    try {
      const json = await fetchProfile(`name=${encodeURIComponent(q)}`);
      if ("error" in json) setResolved({ loading: false, error: json.error, data: null });
      else if (!json.profile) setResolved({ loading: false, error: "No profile for that name.", data: null });
      else setResolved({ loading: false, error: null, data: json.profile });
    } catch {
      setResolved({ loading: false, error: "Couldn’t reach ENS. Try again.", data: null });
    }
  }

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    const name = formName.trim();
    if (!name) return;
    setGen({ loading: true, error: null, data: null });
    setRefresh({ loading: false, error: null, data: null });
    try {
      const res = await fetch("/api/ens/calldata", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "agentRecords",
          name,
          context: formContext.trim() || undefined,
          mcp: formMcp.trim() || undefined,
          a2a: formA2a.trim() || undefined,
          web: formWeb.trim() || undefined,
        }),
      });
      const json = (await res.json()) as CalldataResponse;
      if ("error" in json) setGen({ loading: false, error: json.error, data: null });
      else setGen({ loading: false, error: null, data: json });
    } catch {
      setGen({ loading: false, error: "Network error generating calldata.", data: null });
    }
  }

  async function onCopy() {
    if (!gen.data) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ to: gen.data.to, data: gen.data.data, value: gen.data.value }, null, 2),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function onRefresh() {
    const name = formName.trim();
    if (!name) return;
    setRefresh({ loading: true, error: null, data: null });
    try {
      const json = await fetchProfile(`name=${encodeURIComponent(name)}`);
      if ("error" in json) setRefresh({ loading: false, error: json.error, data: null });
      else if (!json.profile) setRefresh({ loading: false, error: "Name not found.", data: null });
      else setRefresh({ loading: false, error: null, data: json.profile });
    } catch {
      setRefresh({ loading: false, error: "Couldn’t reach ENS. Try again.", data: null });
    }
  }

  const guest = !user?.address || user.guest;

  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-6">
        <h1 className="display text-[30px] font-extrabold">Identity</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          ENS is the identity layer for Forge agents — one human-readable name with on-chain records, resolved live.
        </p>

        {/* ── Forge agent (the headline agent identity) ── */}
        <section className="mt-6 rounded-3xl bg-ink-panel p-6 text-white shadow-card">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
            <Icon name="agent" size={15} />
            Forge design agent
          </p>

          {agent.loading ? (
            <Skeleton dark />
          ) : agent.error ? (
            <div className="mt-3">
              <p className="display truncate text-[20px] font-extrabold leading-tight">{APP.agentEns}</p>
              <p className="mt-1 text-[13px] text-white/55">{agent.error}</p>
            </div>
          ) : agent.data ? (
            <>
              <div className="mt-3 flex items-center gap-3.5">
                <SparkArt ens={APP.agentEns} category="Agents" size={52} />
                <div className="min-w-0 flex-1">
                  <p className="display truncate text-[20px] font-extrabold leading-tight">{agent.data.name}</p>
                  <p className="truncate font-mono text-[12.5px] text-white/55">
                    {short(agent.data.address) || "Not resolved"}
                  </p>
                </div>
                <VerifiedPill verified={agent.data.verified} dark />
              </div>
              <AgentRecordsView agent={agent.data.agent} tone="dark" />
            </>
          ) : null}
        </section>

        {/* ── Your identity ── */}
        <section className="mt-4 rounded-3xl bg-surface p-5 shadow-soft">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
            <Icon name="person" size={15} />
            Your identity
          </p>

          {guest ? (
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
              Sign in with World to reverse-resolve your wallet to its primary ENS name.
            </p>
          ) : mine.loading ? (
            <Skeleton />
          ) : mine.profile ? (
            <div className="mt-3 flex items-center gap-3.5">
              <Avatar profile={mine.profile} size={48} />
              <div className="min-w-0 flex-1">
                <p className="display truncate text-[18px] font-extrabold leading-tight">{mine.profile.name}</p>
                <p className="truncate font-mono text-[12px] text-muted">{short(mine.profile.address)}</p>
              </div>
              <VerifiedPill verified={mine.profile.verified} />
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-[13.5px] text-muted">No primary ENS name for your wallet yet.</p>
              <p className="mt-1 truncate font-mono text-[12px] text-faint">{short(user?.address)}</p>
            </div>
          )}
        </section>

        {/* ── Resolve any name (live ENS explorer) ── */}
        <section className="mt-8">
          <SectionHeader icon="search" title="Resolve any name" sub="Live ENS lookup — try vitalik.eth." />
          <form onSubmit={onResolve} className="flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-full bg-wash px-4">
              <Icon name="search" size={18} className="shrink-0 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="name.eth"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-transparent py-3 text-[15px] outline-none placeholder:text-faint"
              />
            </div>
            <button
              type="submit"
              disabled={resolved.loading || !query.trim()}
              className="shrink-0 rounded-full bg-cta px-5 text-[14px] font-bold text-cta-text transition active:scale-[0.97] disabled:opacity-50"
            >
              {resolved.loading ? "…" : "Resolve"}
            </button>
          </form>

          {resolved.error && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-warn-bg px-4 py-3 text-[13px] text-warn">
              <Icon name="info" size={16} className="mt-0.5 shrink-0" />
              <span>{resolved.error}</span>
            </div>
          )}
          {resolved.data && <ResultCard profile={resolved.data} />}
        </section>

        {/* ── Name an agent (write / ENSIP-26 → unsigned calldata) ── */}
        <section className="mt-8">
          <SectionHeader
            icon="agent"
            title="Name an agent"
            sub="Give an agent an on-chain identity: ENSIP-26 records under a name you own."
          />
          <p className="mb-3 text-[12px] leading-relaxed text-muted">
            Your World wallet lives on World Chain, but ENS records live on Ethereum ({APP.ensChain === "sepolia" ? "Sepolia testnet — free" : "mainnet"}).
            Forge generates the exact calldata for you to sign with an Ethereum wallet (the ens-cli pattern). Spark publish auto-mints subnames when{" "}
            <code className="text-[11px]">ENS_REGISTRAR_PRIVATE_KEY</code> is set.
          </p>

          <form onSubmit={onGenerate} className="flex flex-col gap-3">
            <Field label="ENS name you own">
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={`agent.${APP.ensDomain}`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={inputCls}
              />
            </Field>
            <Field label="agent-context">
              <textarea
                value={formContext}
                onChange={(e) => setFormContext(e.target.value)}
                placeholder="What this agent is, what it can do, how to work with it…"
                rows={3}
                className={`${inputCls} resize-y`}
              />
            </Field>
            <Field label="agent-endpoint[mcp] (optional)">
              <input
                value={formMcp}
                onChange={(e) => setFormMcp(e.target.value)}
                placeholder="https://…/mcp"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={inputCls}
              />
            </Field>
            <Field label="agent-endpoint[a2a] (optional)">
              <input
                value={formA2a}
                onChange={(e) => setFormA2a(e.target.value)}
                placeholder="https://…/a2a"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={inputCls}
              />
            </Field>
            <Field label="agent-endpoint[web] (optional)">
              <input
                value={formWeb}
                onChange={(e) => setFormWeb(e.target.value)}
                placeholder="https://…"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={inputCls}
              />
            </Field>
            <button
              type="submit"
              disabled={gen.loading || !formName.trim()}
              className="mt-1 w-full rounded-full bg-cta py-3.5 text-[15px] font-bold text-cta-text transition active:scale-[0.97] disabled:opacity-50"
            >
              {gen.loading ? "Generating…" : "Generate calldata"}
            </button>
          </form>

          {gen.error && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-warn-bg px-4 py-3 text-[13px] text-warn">
              <Icon name="info" size={16} className="mt-0.5 shrink-0" />
              <span>{gen.error}</span>
            </div>
          )}

          {gen.data && (
            <div className="mt-4 rounded-3xl bg-surface p-5 shadow-soft">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-faint">
                <Icon name="tag" size={15} />
                Unsigned calldata
              </p>
              <p className="mt-1 text-[13px] font-bold text-ink">{gen.data.summary}</p>

              <div className="mt-3 max-h-56 overflow-auto rounded-2xl bg-ink-panel p-4 font-mono text-[11.5px] leading-relaxed text-white/90">
                {(
                  [
                    ["to", gen.data.to],
                    ["data", gen.data.data],
                    ["value", gen.data.value],
                    ["chainId", String(gen.data.chainId)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex gap-2 py-0.5">
                    <span className="shrink-0 text-white/45">{k}</span>
                    <span className="min-w-0 flex-1 break-all">{v}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={onCopy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand py-3 text-[14px] font-bold text-white shadow-pop transition active:scale-[0.97]"
                >
                  <Icon name={copied ? "check" : "tag"} size={16} />
                  {copied ? "Copied" : "Copy"}
                </button>
                <a
                  href={SIGNER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand-soft py-3 text-[14px] font-bold text-brand-strong transition active:scale-[0.97]"
                >
                  <Icon name="arrow-right" size={16} />
                  Open signer
                </a>
              </div>

              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                Sign with any Ethereum wallet (mainnet) to set these records — e.g. paste into{" "}
                <span className="font-mono text-ink">transact.swiss-knife.xyz/send-tx</span>.
              </p>

              <button
                onClick={onRefresh}
                disabled={refresh.loading}
                className="mt-3 w-full rounded-full bg-wash py-3 text-[14px] font-bold text-ink transition active:scale-[0.98] disabled:opacity-50"
              >
                {refresh.loading ? "Refreshing…" : "Refresh agent records"}
              </button>

              {refresh.error && (
                <div className="mt-3 flex items-start gap-2 rounded-2xl bg-warn-bg px-4 py-3 text-[13px] text-warn">
                  <Icon name="info" size={16} className="mt-0.5 shrink-0" />
                  <span>{refresh.error}</span>
                </div>
              )}
              {refresh.data && (
                <div className="mt-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-success">
                    <Icon name="check" size={14} />
                    Now live on-chain
                  </p>
                  <AgentRecordsView agent={refresh.data.agent} />
                </div>
              )}
            </div>
          )}
        </section>
      </main>
      <FloatingNav />
    </>
  );
}
