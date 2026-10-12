// Turns an arbitrary lead export (SaaSquatch or similar) into clean,
// de-duplicated leads. Pure functions, no I/O.

export type Lead = {
  company: string;
  industry: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  domain: string | null;
  employees: number | null;
  yearFounded: number | null;
  revenue: string | null; // as given by the source, e.g. "2M"
  sources: string[];
  locations: string[]; // distinct cities seen across merged rows
};

export type Field = Exclude<keyof Lead, "domain" | "sources" | "locations"> | "source";

// Header synonyms, matched after lower-casing and stripping non-letters.
const SYNONYMS: Record<Field, string[]> = {
  company: ["company", "companyname", "name", "business", "businessname", "organization"],
  industry: ["industry", "category", "businesstype", "sector"],
  street: ["street", "address", "streetaddress", "address1"],
  city: ["city", "town", "locality"],
  state: ["state", "st", "statecode", "stateregion", "region", "province"],
  phone: ["companyphone", "phone", "phonenumber", "businessphone", "telephone"],
  website: ["website", "url", "domain", "site", "web"],
  employees: ["employeescount", "employees", "employeecount", "headcount", "size"],
  yearFounded: ["yearfounded", "founded", "foundedyear", "yearestablished"],
  revenue: ["estimatedrevenue", "revenue", "annualrevenue"],
  source: ["source", "datasource"],
};

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Maps each canonical field to the CSV header that holds it. */
export function mapColumns(headers: string[]): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const [field, names] of Object.entries(SYNONYMS) as [Field, string[]][]) {
    const hit = headers.find((h) => names.includes(key(h)));
    if (hit) out[field] = hit;
  }
  return out;
}

const EMPTY = /^(n\/?a|none|null|-|unknown)?$/i;
const clean = (v: unknown) => {
  const s = String(v ?? "").trim();
  return EMPTY.test(s) ? null : s;
};

export function normalizeDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** US numbers only: "(214) 555-0100". Anything else is kept verbatim. */
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return raw.trim();
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const SUFFIX = /\b(llc|inc|co|corp|corporation|company|ltd|the|and|services?)\b/g;
export const normalizeName = (name: string) =>
  name.toLowerCase().replace(/['’]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();

const toInt = (v: string | null) => {
  const n = v ? parseInt(v.replace(/[^\d]/g, ""), 10) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function toLead(row: Record<string, string>, map: Partial<Record<Field, string>>): Lead | null {
  const get = (f: Field) => (map[f] ? clean(row[map[f]!]) : null);
  const company = get("company");
  if (!company) return null;
  const website = get("website");
  const year = toInt(get("yearFounded"));
  return {
    company,
    industry: get("industry"),
    street: get("street"),
    city: get("city"),
    state: get("state")?.toUpperCase() ?? null,
    phone: normalizePhone(get("phone")),
    website,
    domain: normalizeDomain(website),
    employees: toInt(get("employees")),
    yearFounded: year && year > 1800 && year <= new Date().getFullYear() ? year : null,
    revenue: get("revenue"),
    sources: [get("source") ?? "Upload"],
    locations: [],
  };
}

/**
 * Same business = same website domain, or (no domain) same name + city.
 * Duplicates are merged: empty fields are filled from the copy, sources and
 * cities unioned (one website across several cities = multi-location business).
 */
export function dedupe(leads: Lead[]): { leads: Lead[]; duplicates: number } {
  const byKey = new Map<string, Lead>();
  for (const l of leads) {
    const k = l.domain ?? `${normalizeName(l.company)}|${(l.city ?? "").toLowerCase()}`;
    const seen = byKey.get(k);
    if (!seen) {
      byKey.set(k, { ...l, sources: [...l.sources], locations: l.city ? [l.city] : [] });
      continue;
    }
    if (l.city && !seen.locations.some((c) => c.toLowerCase() === l.city!.toLowerCase())) seen.locations.push(l.city);
    for (const f of Object.keys(l) as (keyof Lead)[]) {
      if (seen[f] == null && l[f] != null) (seen as Record<string, unknown>)[f] = l[f];
    }
    for (const s of l.sources) if (!seen.sources.includes(s)) seen.sources.push(s);
  }
  return { leads: [...byKey.values()], duplicates: leads.length - byKey.size };
}

export function normalizeRows(rows: Record<string, string>[]) {
  const map = mapColumns(Object.keys(rows[0] ?? {}));
  if (!map.company) throw new Error("No company/name column found");
  const parsed = rows.map((r) => toLead(r, map)).filter((l): l is Lead => l !== null);
  return { map, ...dedupe(parsed) };
}
