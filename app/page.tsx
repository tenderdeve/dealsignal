"use client";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { mapColumns, type Field } from "@/lib/normalize";
import type { BuyBox } from "@/lib/score";
import { Sheet } from "./sheet";
import { BuyBoxForm } from "./ui";

type Upload = { name: string; rows: Record<string, string>[] };

const FIELD_LABEL: Partial<Record<Field, string>> = {
  company: "Company",
  industry: "Industry",
  city: "City",
  state: "State",
  phone: "Phone",
  website: "Website",
  employees: "Employees",
  yearFounded: "Year founded",
  revenue: "Revenue",
};

export default function Home() {
  const router = useRouter();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [box, setBox] = useState<BuyBox>({ industries: [], states: [], revenueMin: 1e6, revenueMax: 1e7, minYears: 10 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const columns = useMemo(() => (upload ? mapColumns(Object.keys(upload.rows[0] ?? {})) : {}), [upload]);
  const industries = useMemo(() => {
    const col = columns.industry;
    if (!upload || !col) return [];
    const counts = new Map<string, number>();
    for (const r of upload.rows) if (r[col] && r[col] !== "N/A") counts.set(r[col], (counts.get(r[col]) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 20);
  }, [upload, columns]);

  function load(name: string, text: string) {
    const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const map = mapColumns(Object.keys(data[0] ?? {}));
    if (!map.company) return setError("Couldn't find a company / name column in that file.");
    setError(null);
    setUpload({ name, rows: data });
    // Sensible defaults from the file itself: all its industries, its most common state.
    const ind = map.industry ? [...new Set(data.map((r) => r[map.industry!]).filter((v) => v && v !== "N/A"))] : [];
    const states = map.state ? data.map((r) => r[map.state!]?.toUpperCase()).filter(Boolean) : [];
    const top = states.sort((a, b) => states.filter((s) => s === b).length - states.filter((s) => s === a).length)[0];
    setBox((b) => ({ ...b, industries: ind.slice(0, 20), states: top ? [top] : [] }));
  }

  async function onFile(f: File | undefined) {
    if (f) load(f.name, await f.text());
  }

  async function useSample() {
    load("sample-saasquatch-dfw.csv", await (await fetch("/sample-saasquatch-dfw.csv")).text());
  }

  async function start() {
    if (!upload) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: upload.name, rows: upload.rows, buyBox: box }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.id) {
      setBusy(false);
      return setError(data?.error ?? "Couldn't start. Check your connection and try again.");
    }
    router.push(`/jobs/${data.id}`);
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-12 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-16">
      <div className="min-w-0">
      <h1 className="max-w-xl text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
        Find the owners ready to sell.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
        Bring the list SaaSquatch gave you. DealSignal reads every company&apos;s own website, crosses out the duplicates and
        closed businesses, and highlights the owners worth calling first, with the evidence for each one.
      </p>

      <ol className="mt-10 space-y-5">
        <li className="rounded-lg border border-line bg-card p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold">
            <span className="mr-2 text-brand">1</span>Add your lead list
          </h2>
          {!upload ? (
            <>
              <label
                onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => (e.preventDefault(), setDrag(false), onFile(e.dataTransfer.files[0]))}
                className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30 ${drag ? "border-brand bg-brand-soft" : "border-line hover:border-muted"}`}
              >
                <span className="font-medium">Drop a CSV here, or click to choose one</span>
                <span className="mt-1 text-sm text-muted">SaaSquatch exports work as they are. Any CSV with a company column works too.</span>
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <button onClick={useSample} className="mt-3 text-sm font-medium text-brand hover:underline">
                No file to hand? Use the sample of 106 Dallas–Fort Worth contractors
              </button>
            </>
          ) : (
            <div className="mt-4 rounded-lg bg-panel p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>
                  <b>{upload.name}</b> · {upload.rows.length} rows
                </span>
                <button onClick={() => setUpload(null)} className="text-muted hover:text-ink">Change</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(FIELD_LABEL).map(([f, label]) => {
                  const hit = columns[f as Field];
                  return (
                    <span key={f} className={`rounded border px-2 py-0.5 text-xs ${hit ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200" : "border-line text-muted line-through"}`} title={hit ? `from column "${hit}"` : "not in file"}>
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-drop">{error}</p>}
        </li>

        <li className={`rounded-lg border border-line bg-card p-5 sm:p-6 ${upload ? "" : "pointer-events-none opacity-50"}`}>
          <h2 className="font-display text-lg font-semibold">
            <span className="mr-2 text-brand">2</span>Describe the business you want to buy
          </h2>
          <p className="mb-5 mt-1 text-sm text-muted">This is your buy-box. You can change it later and the list re-ranks instantly.</p>
          <BuyBoxForm value={box} onChange={setBox} industries={industries} emptyHint={upload ? undefined : "Upload a list to choose industries."} />
        </li>
      </ol>

      <button
        onClick={start}
        disabled={!upload || busy}
        className="mt-6 w-full rounded-lg bg-ink px-5 py-3.5 font-display text-lg font-semibold text-paper transition hover:bg-brand disabled:opacity-40"
      >
        {busy ? "Cleaning list…" : "Find my best leads"}
      </button>
      <p className="mt-3 text-sm text-muted">
        Reads only public company websites, respects robots.txt, and never scrapes LinkedIn or gets around bot protection.
      </p>

      <div className="mt-14 lg:hidden"><Sheet /></div>
      </div>

      <aside className="hidden lg:block">
        <Sheet />
      </aside>
    </main>
  );
}
