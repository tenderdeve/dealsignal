// The hero: real rows from the sample list, marked up the way a searcher
// would with a pen and a highlighter. Outcomes are taken from an actual run.
type Line = { name: string; note: string; kind: "keep" | "drop" | "later" };

const LINES: Line[] = [
  { name: "Bacon Roofing", note: "since 1995, owner John Bacon", kind: "keep" },
  { name: "AMERICAN PRIDE ROOFING", note: "duplicate, merged", kind: "drop" },
  { name: "Shelton Electrical Service", note: "website down", kind: "drop" },
  { name: "Brooks Plumbing", note: "family-owned since 1961", kind: "keep" },
  { name: "Apple Roofing", note: "hiring, still growing", kind: "later" },
  { name: "Texaire", note: "site blocks bots, check by hand", kind: "later" },
  { name: "D. Bassett Roofing & Renovation", note: "40 years, owner Don Bassett", kind: "keep" },
  { name: "Touchstone Handyman", note: "website down", kind: "drop" },
  { name: "Ellis Air Conditioning & Heating", note: "18 staff, about $3–6M", kind: "keep" },
];

export function Sheet() {
  let keep = 0;
  let drop = 0;
  return (
    <figure className="lg:sticky lg:top-8">
      <div className="rounded-sm border border-line bg-card shadow-[var(--sheet-shadow)]">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-3 text-sm">
          <span className="font-medium">sample-saasquatch-dfw.csv</span>
          <span className="text-muted">106 rows</span>
        </div>
        <ol className="divide-y divide-line/70">
          {LINES.map((l) => {
            const d = l.kind === "drop" ? 300 + drop++ * 260 : l.kind === "keep" ? 1300 + keep++ * 320 : 0;
            return (
              <li key={l.name} className="grid grid-cols-[1fr_auto] items-baseline gap-4 px-5 py-2.5">
                <span className={`truncate ${l.kind === "later" ? "text-muted" : ""}`}>
                  <span className={l.kind === "keep" ? "mark font-medium" : l.kind === "drop" ? "strike" : ""} style={{ "--d": `${d}ms` } as React.CSSProperties}>
                    {l.name}
                  </span>
                </span>
                <span className={`text-right text-sm italic ${l.kind === "keep" ? "text-brand" : l.kind === "drop" ? "text-drop" : "text-muted"}`}>
                  {l.note}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="border-t border-line px-5 py-2 text-sm text-muted">…and 97 more</div>
      </div>
      <figcaption className="mt-4 max-w-md text-sm text-muted">
        From a real run on the sample: 106 rows became 88 companies, 6 closed businesses were dropped, and 26 were highlighted to call first.
      </figcaption>
    </figure>
  );
}
