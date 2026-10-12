// Builds public/sample-saasquatch-dfw.csv: real DFW trade businesses from
// OpenStreetMap, laid out in SaaSquatch's company-export columns.
// Run: npx tsx scripts/build-sample.mts
import { writeFileSync } from "node:fs";
import Papa from "papaparse";

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const BBOX = "32.4,-97.6,33.3,-96.4"; // Dallas–Fort Worth
const QUERY = `[out:json][timeout:90];
(
  nwr["craft"~"^(hvac|plumber|electrician|roofer)$"]["website"](${BBOX});
  nwr["shop"="hvac"]["website"](${BBOX});
);
out center tags;`;

const INDUSTRY: Record<string, string> = {
  hvac: "HVAC",
  plumber: "Plumbing",
  electrician: "Electrical",
  roofer: "Roofing",
};

type El = { tags: Record<string, string> };

async function fetchOsm(): Promise<El[]> {
  for (const url of MIRRORS) {
    const res = await fetch(url, {
      method: "POST",
      body: new URLSearchParams({ data: QUERY }),
      headers: { "User-Agent": "dealsignal-sample/0.1" },
    }).catch(() => null);
    if (res?.ok) return (await res.json()).elements;
  }
  throw new Error("all Overpass mirrors failed");
}

const na = (v?: string) => v?.trim() || "N/A";

const rows = (await fetchOsm())
  .filter((e) => e.tags.name)
  .map(({ tags: t }) => ({
    Company: t.name,
    Industry: INDUSTRY[t.craft ?? t.shop] ?? "Home Services",
    Street: na([t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ")),
    City: na(t["addr:city"]),
    State: "TX",
    "Company Phone": na(t.phone ?? t["contact:phone"]),
    Website: t.website ?? t["contact:website"],
    "BBB Rating": "N/A",
    "Employees Count": "N/A",
    "Year Founded": na(t.start_date?.slice(0, 4)),
    "Estimated Revenue": "N/A",
    Source: "OpenStreetMap",
  }))
  .sort((a, b) => a.Company.localeCompare(b.Company));

// Real exports get merged from several searches, so the same company shows
// up more than once with different formatting. Simulate a few of those.
const dupes = rows.slice(0, 40).filter((_, i) => i % 8 === 3).map((r) => ({
  ...r,
  Company: r.Company.toUpperCase(),
  Website: r.Website.replace(/^https?:\/\/(www\.)?/, ""),
  Source: "Google Maps",
}));

const out = [...rows, ...dupes];
writeFileSync("public/sample-saasquatch-dfw.csv", Papa.unparse(out));
console.log(`${rows.length} companies + ${dupes.length} simulated duplicates`);
