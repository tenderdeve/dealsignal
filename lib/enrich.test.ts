import { test } from "node:test";
import assert from "node:assert/strict";
import { extract, isPrivateAddress } from "./enrich";

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

test("private and internal addresses are refused", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])
    assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ["8.8.8.8", "34.174.231.0", "172.32.0.1", "2606:4700::1"]) assert.ok(!isPrivateAddress(ip), ip);
});

test("review regressions: no fake years, staff, fleets or owners", () => {
  const x = (t: string) => extract(t, "u");
  assert.equal(x("See our latest 2024 projects").foundedYear, null);
  assert.equal(x("Roofs with a warranty for 25 years").foundedYear, null);
  assert.equal(x("over 30 years of combined experience").foundedYear, null);
  assert.equal(x("Over 500 people trust us").employees, null);
  assert.equal(x("We have serviced over 500 vehicles").fleet, null);
  assert.equal(x("Proudly serving Fort Worth, owner-operated since 1990").owner, null);
  // and the real phrasings still work
  assert.equal(x("Serving Mansfield, TX for Over 50 Years").foundedYear?.value, new Date().getFullYear() - 50);
  assert.equal(x("With 20 technicians on staff").employees?.value, 20);
  assert.equal(x("Est. 1988 in Dallas").foundedYear?.value, 1988);
});

test("business-age phrasings count; experience, age of equipment and warranties don't", () => {
  const y = (t: string) => extract(t, "u").foundedYear?.value ?? null;
  const ago = (n: number) => new Date().getFullYear() - n;
  assert.equal(y("Serving the Dallas / Fort Worth Metroplex for over 40 years!"), ago(40));
  assert.equal(y("For over 10 years Gotcha Covered Contracting has been the choice"), ago(10));
  assert.equal(y("With over 20 years of trusted service, we treat every home"), ago(20));
  assert.equal(y("a trusted name in Lewisville and Flower Mound for nearly 30 years"), ago(30));
  assert.equal(y("solutions for the entire DFW Metroplex for over 15 years."), ago(15));
  for (const t of ["the system was 16 years old", "Expert Technicians 10 Years Experience", "45+ years of professional experience",
    "you get 25 years of worry-free power", "a plumbing professional for more than 25 years", "After 10 years in this position"])
    assert.equal(y(t), null, t);
});

test("a staff member's years in the community are not the company's age", () => {
  assert.equal(extract("Technician Paz has proudly called this community home for 20 years", "u").foundedYear, null);
});
