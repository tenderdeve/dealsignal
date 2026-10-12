"use client";
import { useEffect, useState } from "react";
import type { Evidence } from "@/lib/enrich";
import type { Row } from "@/lib/jobs";
import { Bar, Chip, TierBadge } from "../../ui";

function Fact<T>({ label, ev, show }: { label: string; ev: Evidence<T> | null; show: (v: T) => string }) {
  if (!ev) return null;
  return (
    <li className="rounded-md border border-line p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        <span className="text-xs text-muted">{ev.via === "ai" ? "AI-read, quote verified" : "found on site"}</span>
      </div>
      <div className="mt-0.5 font-medium">{show(ev.value)}</div>
      <blockquote className="mt-1 border-l-2 border-line pl-2 text-xs text-muted">“…{ev.quote}…”</blockquote>
      <a href={ev.source} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-brand hover:underline">{ev.source}</a>
    </li>
  );
}

export function LeadDrawer({ row, onClose, onOpener }: { row: Row; onClose: () => void; onOpener: () => void }) {
  const { lead: l, signals: s, score: sc } = row;
  const [opener, setOpener] = useState(row.opener);
  const [writing, setWriting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setOpener(row.opener), [row.id, row.opener]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  async function write() {
    setWriting(true);
    setErr(null);
    const res = await fetch(`/api/leads/${row.id}/opener`, { method: "POST" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setWriting(false);
    if (!res?.ok || !d?.opener) return setErr(d?.error ?? "Couldn't write an opener right now. Try again.");
    setOpener(d.opener);
    onOpener();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(opener!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Couldn't copy. Select the text and copy it manually.");
    }
  }

  const domainFacts = [
    s?.domainRegistered && `Domain registered ${s.domainRegistered.slice(0, 4)}`,
    s?.mx === true ? "Domain receives email" : s?.mx === false ? "No mail server on domain" : null,
    s?.siteStatus === "blocked" && "Site blocks automated checks",
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-20 bg-black/30" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto border-l border-line bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={l.company}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <TierBadge tier={sc.tier} />
              <h2 className="text-lg font-semibold">{l.company}</h2>
            </div>
            <p className="mt-0.5 text-sm text-muted">{[l.industry, [l.street, l.city, l.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
          </div>
          <button autoFocus onClick={onClose} className="rounded p-1 text-muted hover:bg-panel hover:text-ink" aria-label="Close">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-panel p-3 text-xs">
          <div><div className="mb-1 text-muted">Fit</div><Bar value={sc.fit} label="Fit" /></div>
          <div><div className="mb-1 text-muted">Ready to sell</div><Bar value={sc.readiness} label="Ready to sell" /></div>
          <div><div className="mb-1 text-muted">Data confidence</div><Bar value={sc.confidence} label="Confidence" /></div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {sc.reasons.map((r) => (
            <Chip key={r.text} r={r} />
          ))}
        </div>

        <section className="mt-6">
          <h3 className="text-sm font-semibold">First message to the owner</h3>
          {opener ? (
            <div className="mt-2 rounded-lg border border-line bg-panel p-3">
              <p className="whitespace-pre-wrap text-sm">{opener}</p>
              <div className="mt-2 flex gap-3 text-xs">
                <button onClick={copy} className="font-medium text-brand hover:underline">
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <button onClick={write} disabled={writing} className="text-muted hover:text-ink">{writing ? "Writing…" : "Rewrite"}</button>
              </div>
            </div>
          ) : (
            <button onClick={write} disabled={writing} className="mt-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-paper disabled:opacity-60">
              {writing ? "Writing…" : "Write opener from verified facts"}
            </button>
          )}
          {err && <p className="mt-2 text-xs text-drop">{err}</p>}
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold">Contact</h3>
          <dl className="mt-2 grid grid-cols-[90px_1fr] gap-y-1 text-sm">
            <dt className="text-muted">Owner</dt><dd>{s?.owner ? `${s.owner.value.name}${s.owner.value.title ? ` (${s.owner.value.title})` : ""}` : "—"}</dd>
            <dt className="text-muted">Phone</dt><dd>{l.phone ?? "—"}</dd>
            <dt className="text-muted">Email</dt><dd className="break-all">{s?.emails.join(", ") || "—"}</dd>
            <dt className="text-muted">Website</dt>
            <dd>{l.website ? <a className="text-brand hover:underline" href={/^https?:/.test(l.website) ? l.website : `https://${l.website}`} target="_blank" rel="noreferrer">{l.domain}</a> : "—"}</dd>
            <dt className="text-muted">Sources</dt><dd>{l.sources.join(", ")}</dd>
          </dl>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold">Revenue estimate</h3>
          {sc.revenue && (
            <p className="mt-1 text-sm">
              <b>{sc.revenue.basis === "typical" ? "~" : ""}${(sc.revenue.low / 1e6).toFixed(1)}M–${(sc.revenue.high / 1e6).toFixed(1)}M</b>
              {sc.revenue.basis === "typical" && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">rough guide</span>}
            </p>
          )}
          <p className="mt-1 text-sm text-muted">{sc.revenue?.method}</p>
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold">Evidence</h3>
          {s?.services && <p className="mt-1 text-sm text-muted">{s.services}</p>}
          <ul className="mt-2 space-y-2">
            <Fact label="Founded" ev={s?.foundedYear ?? null} show={(v) => String(v)} />
            <Fact label="Owner" ev={s?.owner ?? null} show={(v) => v.name} />
            <Fact label="Ownership" ev={s?.familyOwned ?? null} show={() => "Family / owner-operated"} />
            <Fact label="Owner-dependent" ev={s?.ownerDependent ?? null} show={() => "Owner works the jobs personally"} />
            <Fact label="Employees" ev={s?.employees ?? null} show={(v) => String(v)} />
            <Fact label="Team page" ev={s?.teamListed ?? null} show={(v) => `${v} people named`} />
            <Fact label="Fleet" ev={s?.fleet ?? null} show={(v) => `${v} trucks/vans`} />
            <Fact label="Hiring" ev={s?.hiring ?? null} show={() => "Currently hiring"} />
            <Fact label="Website last updated" ev={s?.copyrightYear ?? null} show={(v) => `© ${v}`} />
          </ul>
          {domainFacts.length > 0 && <p className="mt-3 text-xs text-muted">{domainFacts.join(" · ")}</p>}
          {s && <p className="mt-1 text-xs text-muted">Checked {s.pages.length} page(s) on {new Date(s.checkedAt).toLocaleDateString()}.</p>}
        </section>
      </aside>
    </div>
  );
}
