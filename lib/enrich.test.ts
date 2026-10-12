import { test } from "node:test";
import assert from "node:assert/strict";
import { extract } from "./enrich";

const owner = (t: string) => extract(t, "https://x.test").owner?.value.name ?? null;

test("owner name: real names in both word orders", () => {
  assert.equal(owner("Take our founder, Greg Coward, for example"), "Greg Coward");
  assert.equal(owner("Randy Bellomy, owner of the company"), "Randy Bellomy");
});

test("owner name: page chrome is not a person", () => {
  assert.equal(owner("Contact Us Our History: Meet Jim Parker Our owner, Jim Parker, started"), "Jim Parker");
  assert.equal(owner("About Us Our founder and responsible master plumber"), null);
  assert.equal(owner("From One Truck to a Community Legacy Our founder, with a family"), null);
});

test("founded year from 'since' and from 'over N years'", () => {
  assert.equal(extract("Trusted Roofing Contractors Since 1995 From", "u").foundedYear?.value, 1995);
  const y = extract("Serving Mansfield for Over 50 Years", "u").foundedYear?.value;
  assert.equal(y, new Date().getFullYear() - 50);
});

test("headcount and fleet phrases", () => {
  assert.equal(extract("Call our 15 licensed technicians today", "u").employees?.value, 15);
  assert.equal(extract("A team of 25 professionals", "u").employees?.value, 25);
  assert.equal(extract("Serving 3 counties since 1990", "u").employees, null);
  assert.equal(extract("our fleet of 12 fully-stocked trucks", "u").fleet?.value, 12);
});

test("team-page headings: people yes, services and page chrome no", async () => {
  const { isPersonName } = await import("./enrich");
  for (const t of ["Hugo Sanchez", "Skye Williams", "Don Bassett", "Aaron Ellis"]) assert.ok(isPersonName(t), t);
  for (const t of ["Roof Repair", "Our Mission", "Privacy Policy", "Garland Office", "Quick Links", "Expert Technicians", "Free Estimates"])
    assert.ok(!isPersonName(t), t);
});
