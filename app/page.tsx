"use client";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { mapColumns, type Field } from "@/lib/normalize";
import type { BuyBox } from "@/lib/score";
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
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: upload.name, rows: upload.rows, buyBox: box }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(data.error ?? "Upload failed");
    }
    router.push(`/jobs/${data.id}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Find the owners ready to sell.</h1>
      <p className="mt-3 text-lg text-muted">
        Drop in a SaaSquatch export. DealSignal checks every company&apos;s website, fills the gaps, and ranks the list by
        how well each business fits your buy-box and how likely its owner is to sell — with the reasons shown.
      </p>

      <ol className="mt-10 space-y-6">
        <li className="rounded-xl border border-line p-5 sm:p-6">
          <h2 className="font-semibold">
            <span className="mr-2 text-brand">1</span>Upload your lead list
          </h2>
          {!upload ? (
            <>
              <label
                onDragOver={(e) => (e.preventDefault(), setDrag(true))}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => (e.preventDefault(), setDrag(false), onFile(e.dataTransfer.files[0]))}
                className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${drag ? "border-brand bg-brand-soft" : "border-line hover:border-slate-400"}`}
              >
                <span className="font-medium">Drag a CSV here, or click to choose</span>
                <span className="mt-1 text-sm text-muted">SaaSquatch exports work as-is. Any CSV with a company column works too.</span>
                <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <button onClick={useSample} className="mt-3 text-sm font-medium text-brand hover:underline">
                No file handy? Use the sample: 106 Dallas–Fort Worth home-service businesses →
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
                    <span key={f} className={`rounded border px-2 py-0.5 text-xs ${hit ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line text-muted line-through"}`} title={hit ? `from column "${hit}"` : "not in file"}>
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
        </li>

        <li className={`rounded-xl border border-line p-5 sm:p-6 ${upload ? "" : "pointer-events-none opacity-50"}`}>
          <h2 className="font-semibold">
            <span className="mr-2 text-brand">2</span>Describe what you want to buy
          </h2>
          <p className="mb-5 mt-1 text-sm text-muted">Your buy-box. You can change it later — results re-rank instantly.</p>
          <BuyBoxForm value={box} onChange={setBox} industries={industries} emptyHint={upload ? undefined : "Upload a list to choose industries."} />
        </li>
      </ol>

      <button
        onClick={start}
        disabled={!upload || busy}
        className="mt-6 w-full rounded-lg bg-brand px-5 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Cleaning list…" : "Find my best leads"}
      </button>
      <p className="mt-3 text-center text-xs text-muted">
        Reads only public company websites, respects robots.txt, and never scrapes LinkedIn or bypasses bot protection.
      </p>
    </main>
  );
}
