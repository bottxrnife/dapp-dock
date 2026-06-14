import Link from "next/link";

/** Primary / brand / soft button or link. */
export function Button({
  children,
  onClick,
  href,
  disabled,
  variant = "primary",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  variant?: "primary" | "brand" | "soft";
  className?: string;
}) {
  const cls =
    variant === "primary"
      ? "bg-cta text-cta-text"
      : variant === "brand"
        ? "bg-brand text-white shadow-pop"
        : "bg-brand-soft text-brand-strong";
  const base = `inline-flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-bold transition active:scale-[0.97] disabled:opacity-50 ${cls} ${className}`;
  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={base}>
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl bg-surface p-5 shadow-soft ${className}`}>{children}</div>
  );
}

export function Pill({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "blue" | "brand" | "green" | "warn";
}) {
  const tones = {
    blue: "bg-brand-soft text-brand-strong",
    brand: "bg-brand text-white",
    green: "bg-success-bg text-success",
    warn: "bg-warn-bg text-warn",
  } as const;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>
  );
}
