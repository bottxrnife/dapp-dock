"use client";

import { Landing } from "@/components/Landing";
import { useAuth } from "@/lib/auth";

/** Gate the whole app behind World sign-in. Shows a brief splash while the
 *  session resolves, the Landing when signed out, the app when signed in. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg,#00b4ff,#0066ff)" }}>
          <span className="animate-pulse text-2xl">✨</span>
        </div>
      </div>
    );
  }

  return user ? <>{children}</> : <Landing />;
}
