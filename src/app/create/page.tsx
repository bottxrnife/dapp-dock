"use client";

import { FloatingNav, NAV_CLEARANCE } from "@/components/FloatingNav";
import { ManifestRunner } from "@/components/ManifestRunner";
import { Card, Pill } from "@/components/ui";
import { createConversation, deleteConversation, listConversations, saveConversation, type Conversation } from "@/lib/conversations";
import { MiniKit } from "@worldcoin/minikit-js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const CHIPS = [
  "A $5 team dues collector that pays treasury.eth",
  "A coffee punch card — 10 stamps for a free coffee",
  "A one-vote-per-human poll for my DAO",
  "An RSVP where each human can claim one ticket",
];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function lastPreview(c: Conversation): string {
  const last = c.messages[c.messages.length - 1];
  if (!last) return "No messages yet";
  return (last.role === "user" ? "You: " : "") + last.text;
}

export default function CreatePage() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "chat">("list");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const list = listConversations();
    if (list.length === 0) {
      const c = createConversation();
      setConvos([c]);
      setActiveId(c.id);
      setView("chat");
    } else {
      setConvos(list);
      setView("list");
    }
    setLoaded(true);
  }, []);

  const active = convos.find((c) => c.id === activeId) ?? null;

  function persist(updated: Conversation) {
    saveConversation(updated);
    setConvos((prev) => [updated, ...prev.filter((c) => c.id !== updated.id)].sort((a, b) => b.updatedAt - a.updatedAt));
  }
  function openChat(id: string) {
    setActiveId(id);
    setView("chat");
    setPreview(false);
    setInput("");
  }
  function newChat() {
    const c = createConversation();
    setConvos((p) => [c, ...p]);
    setActiveId(c.id);
    setView("chat");
    setPreview(false);
    setInput("");
  }
  function backToList() {
    setConvos(listConversations());
    setView("list");
  }
  function removeChat(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    deleteConversation(id);
    setConvos(listConversations());
  }

  const send = async (text: string) => {
    const prompt = text.trim();
    const conv = active;
    if (!prompt || busy || !conv) return;
    setInput("");
    if (taRef.current) taRef.current.style.height = "auto";
    const title = conv.messages.length === 0 ? prompt.slice(0, 48) : conv.title;
    const afterUser: Conversation = { ...conv, title, messages: [...conv.messages, { role: "user", text: prompt }], updatedAt: Date.now() };
    persist(afterUser);
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ history: conv.apiHistory, message: prompt, creator: MiniKit.user?.username ?? "a human", draft: conv.draft }),
      });
      const turn = await res.json();
      const msgs = [...afterUser.messages];
      if (turn.error) msgs.push({ role: "assistant" as const, text: `Something went wrong: ${turn.error}` });
      else if (turn.text) msgs.push({ role: "assistant" as const, text: turn.text });
      persist({
        ...afterUser,
        messages: msgs,
        apiHistory: turn.history ?? afterUser.apiHistory,
        draft: turn.draft ?? afterUser.draft,
        updatedAt: Date.now(),
      });
      if (turn.draft) setPreview(false);
    } catch (e) {
      persist({ ...afterUser, messages: [...afterUser.messages, { role: "assistant", text: `Network error: ${String(e)}` }], updatedAt: Date.now() });
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  };

  if (!loaded) return <main className="px-5 pt-10 text-sm text-muted">Loading…</main>;

  // ── CHATS LIST ─────────────────────────────────────────────
  if (view === "list") {
    return (
      <>
        <main className="mx-auto w-full max-w-md px-5 pb-28 pt-6">
          <div className="flex items-center justify-between">
            <h1 className="display text-[30px] font-extrabold">Chats</h1>
            <button onClick={newChat} className="rounded-full bg-cta px-4 py-2 text-sm font-bold text-cta-text">
              + New
            </button>
          </div>
          <p className="mt-1.5 text-[15px] text-muted">Resume a Spark you were building, or start fresh.</p>

          <div className="mt-4 flex flex-col gap-2.5">
            {convos.map((c) => (
              <button key={c.id} onClick={() => openChat(c.id)} className="flex items-center gap-3.5 rounded-2xl bg-wash p-3.5 text-left">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-blue-soft text-lg">{c.draft ? "✨" : "💬"}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold">{c.title}</p>
                  <p className="truncate text-[13px] text-muted">{lastPreview(c)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[11px] text-faint">{timeAgo(c.updatedAt)}</span>
                  <span onClick={(e) => removeChat(c.id, e)} className="text-[11px] font-semibold text-faint">
                    Delete
                  </span>
                </div>
              </button>
            ))}
            {convos.length === 0 && (
              <div className="rounded-2xl bg-wash p-6 text-center">
                <p className="text-sm text-muted">No chats yet.</p>
                <button onClick={newChat} className="mt-3 inline-flex rounded-full bg-cta px-5 py-2.5 text-sm font-bold text-cta-text">
                  Start a chat →
                </button>
              </div>
            )}
          </div>
        </main>
        <FloatingNav />
      </>
    );
  }

  // ── CHAT ───────────────────────────────────────────────────
  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pt-6" style={{ paddingBottom: NAV_CLEARANCE + 84 }}>
        <div className="flex items-center gap-2">
          <button onClick={backToList} className="rounded-full bg-wash px-3 py-2 text-sm font-bold text-blue-link">
            ‹ Chats
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold">{active?.title ?? "New chat"}</h1>
          <button onClick={newChat} className="rounded-full bg-wash px-3 py-2 text-sm font-bold text-blue-link">
            + New
          </button>
        </div>

        {active && active.messages.length === 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm font-semibold text-muted">What do you want to build?</p>
            {CHIPS.map((c) => (
              <button key={c} onClick={() => send(c)} className="rounded-2xl bg-wash px-4 py-3 text-left text-sm font-medium">
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {active?.messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "self-end" : "self-start"}>
              <div className={`max-w-[18rem] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-cta text-cta-text" : "bg-wash text-ink"}`}>
                {m.text}
              </div>
            </div>
          ))}
          {busy && <p className="self-start text-sm text-muted">Designing…</p>}

          {active?.draft && (
            <Card className="border-2 border-blue-soft">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-base font-extrabold">{active.draft.name}</p>
                  <p className="truncate text-xs text-blue-link">{active.draft.ensName}</p>
                </div>
                {active.draft.permissions.requiresWorldId ? <Pill tone="green">Human-only</Pill> : <Pill>Open</Pill>}
              </div>
              <p className="mt-2 text-sm text-muted">{active.draft.description}</p>
              <p className="mt-2 text-[11px] text-faint">Ask in chat to edit this Spark — e.g. “make it $10” or “add a memo”.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setPreview((v) => !v)} className="flex-1 rounded-xl bg-cta px-4 py-2.5 text-sm font-bold text-cta-text">
                  {preview ? "Hide preview" : "Preview"}
                </button>
                <Link
                  href="/publish"
                  onClick={() => sessionStorage.setItem("forge.draft", JSON.stringify(active.draft))}
                  className="flex-1 rounded-xl bg-blue-soft px-4 py-2.5 text-center text-sm font-bold text-blue-link"
                >
                  Publish →
                </Link>
              </div>
              {preview && (
                <div className="mt-4 border-t border-divider pt-4">
                  <ManifestRunner manifest={active.draft} />
                </div>
              )}
            </Card>
          )}
        </div>
        <div ref={endRef} />
      </main>

      {/* composer — floats above the oval bar (Enter = newline, ⌘/Ctrl+Enter sends) */}
      <div className="pointer-events-none fixed inset-x-0 z-30 mx-auto max-w-md px-5" style={{ bottom: NAV_CLEARANCE - 8 }}>
        <div className="pointer-events-auto flex items-end gap-2 rounded-3xl bg-surface p-1.5 shadow-[0_6px_24px_rgba(11,16,32,0.12)] ring-1 ring-wash">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Describe your Spark…"
            className="max-h-[120px] flex-1 resize-none bg-transparent px-4 py-2.5 text-sm leading-relaxed outline-none"
          />
          <button onClick={() => send(input)} disabled={busy} className="h-10 w-10 shrink-0 rounded-full bg-cta text-lg text-cta-text disabled:opacity-50">
            ↑
          </button>
        </div>
      </div>
      <FloatingNav />
    </>
  );
}
