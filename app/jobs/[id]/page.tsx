"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Row, loadJob } from "@/lib/jobs";
import type { BuyBox, Tier } from "@/lib/score";
import { Bar, BuyBoxForm, Chip, TIER_STYLE, TierBadge } from "../../ui";
import { LeadDrawer } from "./drawer";

type Data = NonNullable<Awaited<ReturnType<typeof loadJob>>>;
const TABS: Tier[] = ["A", "B", "C", "dropped"];
const FILTERS = [
  { key: "owner", label: "Owner known", test: (r: Row) => !!r.signals?.owner },
  { key: "family", label: "Family-owned", test: (r: Row) => !!r.signals?.familyOwned },
  { key: "20y", label: "20+ years", test: (r: Row) => (r.score.yearsInBusiness ?? 0) >= 20 },
  { key: "email", label: "Has email", test: (r: Row) => !!r.signals?.emails.length },
];
const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`);

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tier>("A");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<string[]>([]);
  const [open, setOpen] = useState<Row | null>(null);
  const [editBox, setEditBox] = useState<BuyBox | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/jobs/${id}`);
    if (!res.ok) return setMissing(true);
    const d: Data = await res.json();
    setData(d);
    setOpen((o) => (o ? (d.rows.find((r) => r.id === o.id) ?? null) : null));
    return d;
  }, [id]);

  // Drive the batch worker until every lead is checked, refreshing as we go.
  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await refresh();
      if (!d || running.current || d.stats.done === d.stats.leads) return;
      running.current = true;
      for (let remaining = 1; alive && remaining > 0; ) {
        const res = await fetch(`/api/jobs/${id}/process`, { method: "POST" }).catch(() => null);
        if (!res?.ok) await new Promise((r) => setTimeout(r, 3000));
        else remaining = (await res.json()).remaining;
        if (alive) await refresh();
      }
      running.current = false;
    })();
    return () => {
      alive = false;
    };
  }, [id, refresh]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.toLowerCase();
    return data.rows.filter(
      (r) =>
        r.status === "done" &&
        r.score.tier === tab &&
        (!q || `${r.lead.company} ${r.lead.city} ${r.lead.domain}`.toLowerCase().includes(q)) &&
        filters.every((f) => FILTERS.find((x) => x.key === f)!.test(r)),
    );
  }, [data, tab, query, filters]);

  async function saveBox() {
    await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ buyBox: editBox }) });
    setEditBox(null);
    refresh();
  }

  if (missing) return <main className="mx-auto max-w-7xl px-6 py-16 text-muted">This list doesn&apos;t exist (or was deleted).</main>;
  if (!data) return <main className="mx-auto max-w-7xl px-6 py-16 text-muted">Loading…</main>;

  const { stats, job } = data;
  const box = job.buy_box as BuyBox;
  const progress = stats.leads ? Math.round((stats.done / stats.leads) * 100) : 100;
  const processing = stats.done < stats.leads;
  const industries = [...new Set(data.rows.map((r) => r.lead.industry).filter((x): x is string => !!x))];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{job.file_name}</h1>
          <p className="mt-1 text-sm text-muted">
            {box.industries.length ? box.industries.join(", ") : "Any industry"} · {box.states.length ? box.states.join(", ") : "any state"} ·{" "}
            {box.revenueMin || box.revenueMax ? `${box.revenueMin ? money(box.revenueMin) : "any"}–${box.revenueMax ? money(box.revenueMax) : "any"} revenue` : "any size"}
            {box.minYears ? ` · ${box.minYears}+ yrs` : ""}
            <button onClick={() => setEditBox(box)} className="ml-2 font-medium text-brand hover:underline">Edit buy-box</button>
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/jobs/${id}/export?format=csv`} className="rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-panel">Export CSV</a>
          <a href={`/api/jobs/${id}/export?format=hubspot`} className="rounded-md bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-brand">Export for HubSpot</a>
        </div>
      </div>

      {processing && (
        <div className="mt-6 rounded-lg border border-line p-4" role="status">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Checking company websites…</span>
            <span className="tabular-nums text-muted">{stats.done}/{stats.leads}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel">
            <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">Results appear below as they come in. You can leave and come back — progress is saved.</p>
        </div>
      )}

      {/* The funnel: what happened to the raw list */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { n: stats.rowsIn, l: "rows uploaded" },
          { n: stats.leads, l: `unique companies (${stats.duplicates} duplicates merged)` },
          { n: stats.tiers.dropped, l: "dead websites dropped" },
          { n: stats.tiers.A, l: "Tier A — call first", accent: true },
        ].map((s) => (
          <div key={s.l} className={`rounded-lg border p-4 ${s.accent ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/50" : "border-line"}`}>
            <div className="text-2xl font-semibold tabular-nums">{s.n}</div>
            <div className="text-xs text-muted">{s.l}</div>
          </div>
        ))}
        <div className="col-span-2 rounded-lg border border-line p-4 lg:col-span-1">
          <div className="mb-1 text-xs font-medium text-muted">Gaps filled (before → after)</div>
          {(
            [
              ["Year founded", stats.filled.yearFounded],
              ["Owner name", stats.filled.owner],
              ["Email", stats.filled.email],
              ["Company revenue", stats.filled.revenue],
            ] as const
          ).map(([label, [a, b]]) => (
            <div key={label} className="flex justify-between text-xs">
              <span>{label}</span>
              <span className="tabular-nums">
                <span className="text-muted">{a}%</span> → <b className={b > a ? "text-emerald-700 dark:text-emerald-300" : ""}>{b}%</b>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            title={TIER_STYLE[t].hint}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {TIER_STYLE[t].label} <span className="ml-1 rounded bg-panel px-1.5 text-xs tabular-nums">{stats.tiers[t]}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{TIER_STYLE[tab].hint}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company, city, website"
          className="w-full rounded-md border border-line px-3 py-1.5 text-sm sm:w-64"
        />
        {FILTERS.map((f) => {
          const on = filters.includes(f.key);
          return (
            <button
              key={f.key}
              onClick={() => setFilters(on ? filters.filter((x) => x !== f.key) : [...filters, f.key])}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1 text-xs ${on ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-ink"}`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted">
        Revenue: <b className="font-medium text-ink">$1.2M–2.3M</b> = from this company&apos;s headcount ·{" "}
        <span className="italic">~$0.9M–3.0M*</span> = industry typical for a small firm (no company data found). Hover for the math.
      </p>
      <div className="mt-2 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-panel text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Fit</th>
              <th className="px-3 py-2 font-medium">Ready to sell</th>
              <th className="px-3 py-2 font-medium">Years</th>
              <th className="px-3 py-2 font-medium">Revenue</th>
              <th className="px-3 py-2 font-medium">Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r)} className="cursor-pointer border-t border-line align-top hover:bg-panel">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <TierBadge tier={r.score.tier} />
                    <span className="font-medium">{r.lead.company}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {[r.lead.industry, r.lead.city].filter(Boolean).join(" · ")}
                    {r.lead.domain && <> · {r.lead.domain}</>}
                  </div>
                </td>
                <td className="px-3 py-2.5"><Bar value={r.score.fit} label="Fit" /></td>
                <td className="px-3 py-2.5"><Bar value={r.score.readiness} label="Ready to sell" /></td>
                <td className="px-3 py-2.5 tabular-nums">{r.score.yearsInBusiness ?? <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                  {r.score.revenue?.basis === "company" ? (
                    <span title={r.score.revenue.method}>{money(r.score.revenue.low)}–{money(r.score.revenue.high)}</span>
                  ) : r.score.revenue ? (
                    <span className="italic text-muted" title={r.score.revenue.method}>~{money(r.score.revenue.low)}–{money(r.score.revenue.high)}*</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {r.score.reasons
                      .filter((x) => x.tone !== "neutral" || x.kind === "ready")
                      .slice(0, 4)
                      .map((x) => (
                        <Chip key={x.text} r={x} />
                      ))}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted">
                  {processing ? "Still checking — leads land here as they finish." : "No leads here with these filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <LeadDrawer row={open} onClose={() => setOpen(null)} onOpener={refresh} />}

      {editBox && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4" onClick={() => setEditBox(null)}>
          <div className="w-full max-w-xl rounded-xl border border-line bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit buy-box">
            <h2 className="mb-4 font-semibold">Edit buy-box</h2>
            <BuyBoxForm value={editBox} onChange={setEditBox} industries={industries} />
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditBox(null)} className="rounded-md px-3 py-2 text-sm text-muted hover:text-ink">Cancel</button>
              <button onClick={saveBox} className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-paper">Re-rank</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
