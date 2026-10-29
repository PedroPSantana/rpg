import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "ghost" | "danger" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-blood text-bone hover:bg-[#c8352b] shadow-[0_0_0_1px_rgb(255_255_255/0.06)_inset]",
  ghost: "border border-line bg-raised/60 text-bone hover:border-ash/60 hover:bg-raised",
  danger: "border border-blood/50 text-[#ff9a8f] hover:bg-blood/20",
  quiet: "text-ash hover:text-bone hover:bg-raised/60",
};

export function buttonClass(variant: Variant = "ghost", extra = "") {
  return `inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${VARIANTS[variant]} ${extra}`;
}

export function Button({ variant = "ghost", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

export function ButtonLink({ variant = "ghost", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...props} className={buttonClass(variant, className)} />;
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={`rounded-xl border border-line bg-panel/80 backdrop-blur-sm ${className}`} />;
}

const TONES = {
  neutral: "border-line text-ash",
  red: "border-blood/50 text-[#ff9a8f] bg-blood/10",
  gold: "border-gold/40 text-gold bg-gold/10",
  green: "border-ok/40 text-ok bg-ok/10",
  blue: "border-sanity/40 text-sanity bg-sanity/10",
} as const;

export function Badge({ tone = "neutral", children, className = "" }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${TONES[tone]} ${className}`}>{children}</span>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-blood">{eyebrow}</p>}
        <h1 className="font-display text-3xl text-bone sm:text-4xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Meter({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold tracking-wide text-ash">{label}</span>
        <span className="font-mono text-bone">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
