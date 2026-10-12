import { test } from "node:test";
import assert from "node:assert/strict";
import { mapColumns, normalizeDomain, normalizePhone, normalizeRows } from "./normalize";

test("maps SaaSquatch headers", () => {
  const m = mapColumns(["Company", "Company Phone", "Website", "Employees Count", "Year Founded", "Estimated Revenue"]);
  assert.equal(m.company, "Company");
  assert.equal(m.phone, "Company Phone");
  assert.equal(m.employees, "Employees Count");
  assert.equal(m.yearFounded, "Year Founded");
  assert.equal(m.revenue, "Estimated Revenue");
});

test("domain ignores scheme, www, path and case", () => {
  assert.equal(normalizeDomain("https://WWW.AcGenius.com/about"), "acgenius.com");
  assert.equal(normalizeDomain("acgenius.com/"), "acgenius.com");
  assert.equal(normalizeDomain("not a url"), null);
});

test("phone formats the messy variants", () => {
  for (const p of ["+1-817- 581-1214", "+18175811214", "(817) 581 1214"]) {
    assert.equal(normalizePhone(p), "(817) 581-1214");
  }
});

test("dedupe merges same domain and fills gaps", () => {
  const { leads, duplicates } = normalizeRows([
    { Company: "Acme Air LLC", Website: "https://www.acme.com", "Company Phone": "N/A", Source: "Apollo" },
    { Company: "Acme Heating & Cooling", Website: "acme.com", "Company Phone": "2145550100", Source: "Google Maps" },
    { Company: "Other Co", Website: "other.com", "Company Phone": "", Source: "Apollo" },
  ]);
  assert.equal(duplicates, 1);
  assert.equal(leads.length, 2);
  assert.equal(leads[0].phone, "(214) 555-0100");
  assert.deepEqual(leads[0].sources, ["Apollo", "Google Maps"]);
});

test("dedupe without domain falls back to name + city", () => {
  const { duplicates } = normalizeRows([
    { Company: "Bob's Plumbing, Inc.", City: "Dallas" },
    { Company: "BOBS PLUMBING", City: "dallas" },
    { Company: "Bob's Plumbing", City: "Plano" },
  ]);
  assert.equal(duplicates, 1);
});

test("same website in several cities counts locations", () => {
  const { leads } = normalizeRows([
    { Company: "Pride Roofing", Website: "pride.com", City: "Allen" },
    { Company: "Pride Roofing", Website: "pride.com", City: "Frisco" },
    { Company: "PRIDE ROOFING", Website: "pride.com", City: "allen" },
  ]);
  assert.deepEqual(leads[0].locations, ["Allen", "Frisco"]);
});

test("short state headers like ST are recognised", () => {
  assert.equal(mapColumns(["Business Name", "URL", "Town", "ST"]).state, "ST");
  assert.equal(mapColumns(["Business Name", "URL", "Town", "ST"]).city, "Town");
});
