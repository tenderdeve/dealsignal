"use client";
import type { BuyBox, Reason, Tier } from "@/lib/score";

export const TIER_STYLE: Record<Tier, { label: string; badge: string; hint: string }> = {
  A: { label: "Tier A", badge: "bg-emerald-600 text-white", hint: "Call first: fits your buy-box and shows seller signals" },
  B: { label: "Tier B", badge: "bg-amber-500 text-white", hint: "Worth a look: partial fit or fewer signals" },
  C: { label: "Tier C", badge: "bg-slate-400 text-white", hint: "Low priority" },
  dropped: { label: "Dropped", badge: "bg-rose-500 text-white", hint: "Website down — the business may be closed" },
};

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TIER_STYLE[tier].badge}`}>{tier === "dropped" ? "—" : tier}</span>;
}

export function Bar({ value, label }: { value: number; label: string }) {
  const color = value >= 70 ? "bg-emerald-500" : value >= 40 ? "bg-amber-400" : "bg-strike";
  return (
    <div className="flex items-center gap-2" title={`${label}: ${value}/100`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-panel">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 text-right text-xs tabular-nums text-muted">{value}</span>
    </div>
  );
}

const TONE = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  bad: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200",
  neutral: "border-line bg-panel text-ink/80",
};

export function Chip({ r }: { r: Pick<Reason, "text" | "tone"> }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${TONE[r.tone]}`}>{r.text}</span>;
}

const REVENUE_STEPS = [null, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7];
const fmt = (n: number | null) => (n == null ? "Any" : n >= 1e6 ? `$${n / 1e6}M` : `$${n / 1e3}k`);

/** The searcher's "buy-box": what they are looking to acquire. */
export function BuyBoxForm({
  value,
  onChange,
  industries,
  emptyHint = "No industry column found — all industries count.",
}: {
  value: BuyBox;
  onChange: (b: BuyBox) => void;
  industries: string[];
  emptyHint?: string;
}) {
  const toggle = (i: string) =>
    onChange({ ...value, industries: value.industries.includes(i) ? value.industries.filter((x) => x !== i) : [...value.industries, i] });
  const select = "w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm";
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm font-medium">Industries</label>
        <div className="flex flex-wrap gap-2">
          {industries.map((i) => {
            const on = value.industries.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-sm transition ${on ? "border-brand bg-brand text-paper" : "border-line bg-card hover:border-muted"}`}
              >
                {i}
              </button>
            );
          })}
          {!industries.length && <span className="text-sm text-muted">{emptyHint}</span>}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="states">States</label>
        <input
          id="states"
          className={select}
          placeholder="e.g. TX, OK (blank = any)"
          value={value.states.join(", ")}
          onChange={(e) => onChange({ ...value, states: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) })}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="years">Min. years in business</label>
        <select id="years" className={select} value={value.minYears ?? ""} onChange={(e) => onChange({ ...value, minYears: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Any</option>
          {[5, 10, 15, 20, 30].map((y) => (
            <option key={y} value={y}>{y}+ years</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm font-medium">Annual revenue</label>
        <div className="flex items-center gap-2">
          {(["revenueMin", "revenueMax"] as const).map((k, idx) => (
            <div key={k} className="flex flex-1 items-center gap-2">
              {idx === 1 && <span className="text-muted">to</span>}
              <select
                aria-label={k === "revenueMin" ? "Minimum revenue" : "Maximum revenue"}
                className={select}
                value={value[k] ?? ""}
                onChange={(e) => onChange({ ...value, [k]: e.target.value ? Number(e.target.value) : null })}
              >
                {REVENUE_STEPS.map((n) => (
                  <option key={String(n)} value={n ?? ""}>{fmt(n)}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Estimated from employee count × US Census revenue-per-employee for the industry.</p>
      </div>
    </div>
  );
}
