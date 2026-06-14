"use client";

import { FloatingNav } from "@/components/FloatingNav";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { APP } from "@/lib/config";

export default function ProfilePage() {
  const { user, signOut, inWorldApp } = useAuth();

  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-6">
        <h1 className="display text-[30px] font-extrabold">Profile</h1>

        <div className="mt-4 flex items-center gap-3 rounded-3xl bg-wash p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg,#00b4ff,#0066ff)" }}>
            <span className="text-lg font-extrabold text-white">{(user?.username ?? "0")[0]?.toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">@{user?.username ?? "human"}</p>
            <p className="truncate text-xs text-muted">{user?.guest ? "Preview session" : user?.address}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2.5">
          <div className="rounded-2xl bg-wash p-3.5">
            <p className="text-[14px] font-bold">World ID</p>
            <p className="mt-0.5 text-[13px] text-muted">
              {user?.guest ? "Preview (not in World App)." : "Signed in — proof-of-human is requested per Spark that needs it."}
            </p>
          </div>
          <div className="rounded-2xl bg-wash p-3.5">
            <p className="text-[14px] font-bold">Design agent</p>
            <p className="mt-0.5 text-[13px] text-muted">assistant.agent.{APP.ensDomain}</p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Button href="/create">Create a Spark</Button>
          <Button href="/catalog" variant="soft">Browse Sparks</Button>
        </div>

        <button onClick={signOut} className="mt-4 w-full rounded-2xl bg-wash py-3 text-sm font-bold text-muted">
          Sign out
        </button>
      </main>
      <FloatingNav />
    </>
  );
}
