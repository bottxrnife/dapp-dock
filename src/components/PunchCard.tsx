"use client";

import { appEmoji } from "@/lib/appStyle";
import type { LoyaltyRecord } from "@/lib/store";

/**
 * Loyalty punch card — the full pass for a `punchCard` Spark. Drawn on a dark
 * panel so it reads as a physical card; the stamp glyph is the Spark's own emoji
 * and the progress line tells the user how close they are to the reward.
 */
export function PunchCard({
  brand,
  ens,
  category,
  total,
  reward,
  record,
}: {
  brand: string;
  ens: string;
  category?: string;
  total: number;
  reward: string;
  record: LoyaltyRecord;
}) {
  const punches = Math.min(record.punches, total);
  const full = punches >= total;
  const remaining = total - punches;
  const emoji = appEmoji(ens, category);

  return (
    <div className="rounded-[22px] bg-ink-panel p-[18px] text-white">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-white/55">{brand}</p>
          <p className="mt-1 text-[16px] font-extrabold">
            {punches} of {total} stamps
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold">
          ★ {record.points.toLocaleString()} pts
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        {Array.from({ length: total }, (_, i) => {
          const filled = i < punches;
          const isNext = i === punches && !full;
          return (
            <div
              key={i}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-bold ${
                filled
                  ? "bg-cta text-cta-text"
                  : isNext
                    ? "border-[1.5px] border-white/60 text-white/70"
                    : "border-[1.5px] border-white/20 text-white/35"
              } ${isNext ? "animate-pulse" : ""}`}
            >
              {filled ? emoji : i + 1}
            </div>
          );
        })}
      </div>

      <div className="mt-4 h-px bg-white/10" />
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-white/60">
          {full
            ? `Card full — your free ${reward} is ready 🎉`
            : `${remaining} more ${remaining === 1 ? "visit" : "visits"} until a free ${reward}`}
        </p>
        {record.redeemed > 0 && (
          <span className="shrink-0 text-[11.5px] font-semibold text-white/45">{record.redeemed} redeemed</span>
        )}
      </div>
    </div>
  );
}
