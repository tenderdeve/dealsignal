// Explainable scoring: every point comes with a human-readable reason.
// Pure function of (lead, signals, buy-box), so changing the buy-box
// re-ranks instantly without re-crawling.
import benchmarks from "../data/revenue-benchmarks.json";
import type { Signals } from "./enrich";
import type { Lead } from "./normalize";

export type BuyBox = {
  industries: string[]; // empty = any
  states: string[]; // empty = any
  revenueMin: number | null;
  revenueMax: number | null;
  minYears: number | null;
};

export type Reason = { text: string; tone: "good" | "bad" | "neutral"; kind: "fit" | "ready" };
export type Tier = "A" | "B" | "C" | "dropped";
export type Revenue = { low: number; high: number; method: string } | null;

export type Score = {
  fit: number;
  readiness: number;
  confidence: number;
  tier: Tier;
  revenue: Revenue;
  yearsInBusiness: number | null;
  reasons: Reason[];
};

type Bench = { naics: string; label: string; revenuePerEmployee: number };
const BENCH = benchmarks as Record<string, Bench>;

const INDUSTRY_KEYS: [RegExp, string][] = [
  [/hvac|air cond|heating|plumb/i, "hvac_plumbing"],
  [/roof/i, "roofing"],
  [/electric/i, "electrical"],
  [/paint/i, "painting"],
  [/landscap|lawn/i, "landscaping"],
  [/pest|extermin/i, "pest_control"],
  [/janitor|cleaning/i, "janitorial"],
  [/auto|car repair|mechanic/i, "auto_repair"],
  [/account|cpa|bookkeep/i, "accounting"],
];

export const benchmarkFor = (industry: string | null): Bench =>
  BENCH[INDUSTRY_KEYS.find(([re]) => industry && re.test(industry))?.[1] ?? "all"];

export const money = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : `$${Math.round(n / 1e3)}k`;

function parseMoney(s: string | null): number | null {
  const m = s?.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([kmb])?/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Number(m[1]) * mult;
}

export function estimateRevenue(lead: Lead, s: Signals | null): Revenue {
  const employees = s?.employees?.value ?? lead.employees;
  if (employees) {
    const b = benchmarkFor(lead.industry);
    const mid = employees * b.revenuePerEmployee;
    return {
      low: mid * 0.7,
      high: mid * 1.3,
      method: `${employees} employees × ${money(b.revenuePerEmployee)}/employee (US Census 2022, ${b.label}) ±30%`,
    };
  }
  const given = parseMoney(lead.revenue);
  return given ? { low: given * 0.8, high: given * 1.2, method: `Source list estimate ${lead.revenue} ±20%` } : null;
}

export function scoreLead(lead: Lead, s: Signals | null, box: BuyBox, now = new Date().getFullYear()): Score {
  const reasons: Reason[] = [];
  const add = (kind: Reason["kind"], tone: Reason["tone"], text: string) => reasons.push({ kind, tone, text });
  const revenue = estimateRevenue(lead, s);

  const founded = s?.foundedYear?.value ?? lead.yearFounded;
  const years = founded ? now - founded : null;
  const domainYear = [s?.domainRegistered, s?.firstArchived]
    .filter(Boolean)
    .map((d) => Number(d!.slice(0, 4)))
    .sort()[0];
  const onlineYears = domainYear ? now - domainYear : null;

  if (s?.siteStatus === "down") {
    add("ready", "bad", "Website down — may be closed");
    return { fit: 0, readiness: 0, confidence: 0, tier: "dropped", revenue, yearsInBusiness: years, reasons };
  }

  if (s?.siteStatus === "blocked") add("ready", "neutral", "Site blocks automated checks — verify manually");

  // --- fit: does it match the buy-box? ---
  let fit = 0;
  const industryOk = !box.industries.length || box.industries.some((i) => lead.industry?.toLowerCase() === i.toLowerCase());
  if (industryOk) fit += 30;
  else add("fit", "bad", `Outside target industries (${lead.industry ?? "unknown"})`);

  const stateOk = !box.states.length || (lead.state != null && box.states.includes(lead.state));
  if (stateOk) fit += 25;
  else add("fit", "bad", `Outside target states (${lead.state ?? "unknown"})`);

  if (revenue) {
    const inRange = (box.revenueMin == null || revenue.high >= box.revenueMin) && (box.revenueMax == null || revenue.low <= box.revenueMax);
    if (inRange) {
      fit += 25;
      add("fit", "good", `Revenue ${money(revenue.low)}–${money(revenue.high)}`);
    } else add("fit", "bad", `Revenue ${money(revenue.low)}–${money(revenue.high)} outside target`);
  } else {
    fit += 12;
    add("fit", "neutral", "Size unknown");
  }

  if (box.minYears == null) fit += 20;
  else if (years != null) {
    if (years >= box.minYears) fit += 20;
    else add("fit", "bad", `Only ${years} yrs in business`);
  } else if (onlineYears != null && onlineYears >= box.minYears) fit += 12;
  else fit += 8;

  // --- readiness: how likely is the owner to sell? ---
  let ready = 0;
  if (years != null && years >= 20) {
    ready += 25;
    add("ready", "good", `${years} yrs in business (since ${founded})`);
  } else if (years != null && years >= 10) {
    ready += 12;
    add("ready", "neutral", `${years} yrs in business`);
  } else if (years == null && onlineYears != null && onlineYears >= 15) {
    ready += 10;
    add("ready", "neutral", `Online since ${domainYear}`);
  }
  if (s?.familyOwned) {
    ready += 20;
    add("ready", "good", "Family / owner-operated");
  }
  if (s?.owner) {
    ready += 10;
    add("ready", "good", `Owner: ${s.owner.value.name}`);
  }
  if (s?.ownerDependent) {
    ready += 10;
    add("ready", "good", "Runs on the owner personally");
  }
  const locations = Math.max(s?.multiLocation?.value ?? 1, lead.locations.length);
  if (s?.siteStatus === "ok" && locations <= 1) {
    ready += 10;
    add("ready", "good", "Single location");
  } else if (locations > 1) add("ready", "neutral", `${locations} locations`);
  if (s?.siteStatus === "ok" && !s.hiring) {
    ready += 10;
    add("ready", "good", "Not hiring");
  } else if (s?.hiring) add("ready", "neutral", "Hiring — still growing");
  if (s?.copyrightYear && s.copyrightYear.value <= now - 3) {
    ready += 15;
    add("ready", "good", `Website last updated ${s.copyrightYear.value}`);
  }
  ready = Math.min(ready, 100);

  // --- confidence: how much of this is verified rather than unknown? ---
  const checks = [s?.siteStatus === "ok", founded != null, !!s?.owner, revenue != null, lead.phone != null, s?.mx === true];
  const confidence = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const tier: Tier = fit >= 70 && ready >= 50 ? "A" : fit >= 50 && ready >= 25 ? "B" : "C";
  return { fit, readiness: ready, confidence, tier, revenue, yearsInBusiness: years, reasons };
}

/** Untrusted request body → a valid buy-box. */
export function sanitizeBuyBox(b: Partial<BuyBox> | undefined): BuyBox {
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 50) : []);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    industries: strs(b?.industries),
    states: strs(b?.states).map((s) => s.toUpperCase()),
    revenueMin: num(b?.revenueMin),
    revenueMax: num(b?.revenueMax),
    minYears: num(b?.minYears),
  };
}
