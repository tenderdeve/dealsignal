import { test } from "node:test";
import assert from "node:assert/strict";
import type { Signals } from "./enrich";
import type { Lead } from "./normalize";
import { estimateRevenue, scoreLead, type BuyBox } from "./score";

const lead = (over: Partial<Lead> = {}): Lead => ({
  company: "Bacon Roofing",
  industry: "Roofing",
  street: null,
  city: "Rowlett",
  state: "TX",
  phone: "(972) 555-0100",
  website: "baconroofing.com",
  domain: "baconroofing.com",
  employees: null,
  yearFounded: null,
  revenue: null,
  sources: ["OpenStreetMap"],
  locations: ["Rowlett"],
  ...over,
});

const ev = <T>(value: T) => ({ value, source: "https://x.test/about", quote: "…", via: "site" as const });
const sig = (over: Partial<Signals> = {}): Signals => ({
  checkedAt: "2026-10-12",
  siteStatus: "ok",
  robotsBlocked: false,
  pages: [],
  foundedYear: null,
  copyrightYear: null,
  familyOwned: null,
  owner: null,
  employees: null,
  teamListed: null,
  fleet: null,
  hiring: null,
  multiLocation: null,
  ownerDependent: null,
  emails: [],
  services: null,
  domainRegistered: null,
  mx: true,
  ...over,
});

const box: BuyBox = { industries: ["Roofing"], states: ["TX"], revenueMin: 1e6, revenueMax: 1e7, minYears: 10 };

test("long-running family business with owner is Tier A", () => {
  const s = sig({ foundedYear: ev(1995), familyOwned: ev(true as const), owner: ev({ name: "John Bacon", title: "owner" }), employees: ev(10) });
  const r = scoreLead(lead(), s, box, 2026);
  assert.equal(r.tier, "A");
  assert.equal(r.fit, 100);
  assert.ok(r.reasons.some((x) => x.text === "31 yrs in business (since 1995)"));
  assert.ok(r.reasons.some((x) => x.text === "Owner: John Bacon"));
});

test("dead website is dropped, not silently removed", () => {
  const r = scoreLead(lead(), sig({ siteStatus: "down" }), box, 2026);
  assert.equal(r.tier, "dropped");
  assert.equal(r.reasons[0].text, "Website down — may be closed");
});

test("outside the buy-box loses fit points with a reason", () => {
  const r = scoreLead(lead({ state: "OK", industry: "Painting" }), sig(), box, 2026);
  assert.equal(r.fit, 20); // only "typical size" 12 + "tenure unknown" 8
  assert.ok(r.reasons.some((x) => x.text.startsWith("Outside target states")));
  assert.ok(r.reasons.some((x) => x.text.startsWith("Outside target industries")));
});

test("multi-location and hiring do not earn readiness", () => {
  const r = scoreLead(lead({ locations: ["Allen", "Frisco", "Plano"] }), sig({ hiring: ev(true as const) }), box, 2026);
  assert.equal(r.readiness, 0);
});

test("revenue comes from employees × Census benchmark, with the math shown", () => {
  const r = estimateRevenue(lead({ industry: "HVAC" }), sig({ employees: ev(10) }))!;
  assert.equal(Math.round((r.low + r.high) / 2), 10 * 260272);
  assert.match(r.method, /^10 staff \(stated on site\) × \$260k\/employee/);
});

test("no headcount falls back to a clearly-labelled industry typical range", () => {
  const r = estimateRevenue(lead({ industry: "HVAC" }), sig())!;
  assert.equal(r.basis, "typical");
  assert.equal(r.low, 921302);
  assert.equal(r.high, 2960335);
  assert.match(r.method, /^Industry typical, not company-specific/);
  assert.equal(estimateRevenue(lead({ revenue: "$2.5M" }), sig())!.low, 2e6);
});

test("typical range scales with locations", () => {
  const r = estimateRevenue(lead({ industry: "HVAC", locations: ["Allen", "Frisco"] }), sig())!;
  assert.equal(r.low, 921302 * 2);
});

test("headcount evidence: stated beats team page beats trucks", () => {
  assert.match(estimateRevenue(lead(), sig({ employees: ev(8), teamListed: ev(5) }))!.method, /^8 staff \(stated/);
  assert.match(estimateRevenue(lead(), sig({ teamListed: ev(5), fleet: ev(10) }))!.method, /^≥5 staff/);
  const r = estimateRevenue(lead(), sig({ fleet: ev(10) }))!;
  assert.equal(r.basis, "company");
  assert.match(r.method, /^~15 staff \(10 trucks/);
});

test("typical size never fails the buy-box, only half credit", () => {
  const r = scoreLead(lead(), sig({ foundedYear: ev(1990) }), { ...box, revenueMin: 5e7, revenueMax: null }, 2026);
  assert.equal(r.fit, 30 + 25 + 12 + 20);
  assert.ok(r.reasons.some((x) => x.text.startsWith("Typical size")));
});

test("bot-protected site is kept, flagged, and earns no site-based points", () => {
  const r = scoreLead(lead(), sig({ siteStatus: "blocked" }), box, 2026);
  assert.notEqual(r.tier, "dropped");
  assert.equal(r.readiness, 0);
  assert.ok(r.reasons.some((x) => x.text.startsWith("Site blocks automated checks")));
});

test("wrong state can never be Tier A, even with strong signals", () => {
  const s = sig({ foundedYear: ev(1980), familyOwned: ev(true as const), owner: ev({ name: "A B", title: null }), employees: ev(10) });
  const r = scoreLead(lead({ state: "OK" }), s, box, 2026);
  assert.ok(r.fit >= 70 && r.readiness >= 50);
  assert.notEqual(r.tier, "A");
});
