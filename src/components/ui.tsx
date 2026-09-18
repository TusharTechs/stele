import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The shared vocabulary of the interface.
 *
 * Colour carries meaning here and only one meaning each: verdigris for verified or passed, bronze
 * for knowledge and anything learned, terracotta for failed or withheld. `tone` is the only way to
 * reach those colours, so a status can't accidentally mean something different on another screen.
 */

export type Tone = "neutral" | "verified" | "knowledge" | "failed";

const TONE: Record<Tone, string> = {
  neutral: "border-basalt-700 bg-basalt-850 text-bone-400",
  verified: "border-verdigris-500/40 bg-verdigris-900 text-verdigris-400",
  knowledge: "border-bronze-400/40 bg-bronze-900 text-bronze-300",
  failed: "border-terracotta-500/40 bg-terracotta-900 text-terracotta-400",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag className={`rounded-lg border border-basalt-800 bg-basalt-900 ${className}`}>{children}</Tag>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-bone-500">{children}</h2>
      {hint ? <span className="text-xs text-bone-500">{hint}</span> : null}
    </div>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-verdigris-500 text-basalt-950 hover:bg-verdigris-400 disabled:bg-basalt-700 disabled:text-bone-500",
  secondary: "border border-basalt-700 bg-basalt-850 text-bone-200 hover:border-basalt-600 hover:text-bone-50 disabled:text-bone-500",
  ghost: "text-bone-400 hover:text-bone-50 disabled:text-bone-500",
  danger: "border border-terracotta-500/40 bg-terracotta-900 text-terracotta-400 hover:border-terracotta-500 disabled:opacity-50",
} as const;

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A score against its target.
 *
 * The target is always shown beside the number, because 7/10 means nothing until you know whether
 * the brief asked for 6 or 9.
 */
export function Score({ value, target }: { value: number; target: number }) {
  const met = value >= target;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span
        className={`font-mono text-2xl leading-none tabular-nums ${met ? "text-verdigris-400" : "text-bronze-300"}`}
      >
        {value.toFixed(value % 1 === 0 ? 0 : 1)}
      </span>
      <span className="font-mono text-xs text-bone-500">/10 · target {target}</span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-dashed border-basalt-700 px-4 py-6 text-center text-sm text-bone-500">
      {children}
    </p>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-baseline gap-2 ${className}`}>
      <span className="font-mono text-base font-semibold tracking-[0.2em] text-bone-50 uppercase">Stele</span>
      <span className="h-3 w-px bg-basalt-600" aria-hidden />
      <span className="hidden text-xs text-bone-500 transition-colors group-hover:text-bone-400 sm:inline">
        every frame, on the record
      </span>
    </Link>
  );
}

export function Money({ usd }: { usd: number }) {
  // Sub-cent amounts are the norm for reasoning calls; rounding them to cents shows $0.00 all day.
  return <span className="font-mono tabular-nums">${usd < 0.01 && usd > 0 ? usd.toFixed(4) : usd.toFixed(2)}</span>;
}

/**
 * A timestamp, rendered as an absolute date.
 *
 * "2h ago" needs the current time, which differs between the server render and the client's
 * hydration — so it is both impure and a guaranteed mismatch. The absolute form is stable, and a
 * `<time>` element gives the exact instant on hover without a second render.
 */
export function Ago({ at }: { at: number }) {
  const date = new Date(at);
  return (
    <time dateTime={date.toISOString()} title={date.toISOString()}>
      {date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
    </time>
  );
}
