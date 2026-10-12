// Collects public, verifiable signals about one business from its own website
// and from domain records. Every signal keeps the URL + quote it came from.
import * as cheerio from "cheerio";
import { resolveMx } from "node:dns/promises";
import firstNames from "../data/first-names.json";
import { aiEnabled, chat } from "./groq";

export type Evidence<T> = { value: T; source: string; quote: string; via: "site" | "ai" };

export type Signals = {
  checkedAt: string;
  siteStatus: "ok" | "blocked" | "down"; // blocked = bot protection (403/429), we do not try to bypass it
  robotsBlocked: boolean;
  pages: string[];
  foundedYear: Evidence<number> | null;
  copyrightYear: Evidence<number> | null;
  familyOwned: Evidence<true> | null;
  owner: Evidence<{ name: string; title: string | null }> | null;
  employees: Evidence<number> | null; // stated outright ("team of 25", "our 15 technicians")
  teamListed: Evidence<number> | null; // people named on a team page (a lower bound)
  fleet: Evidence<number> | null; // service trucks/vans mentioned
  hiring: Evidence<true> | null;
  multiLocation: Evidence<number> | null;
  ownerDependent: Evidence<true> | null;
  emails: string[];
  services: string | null;
  domainRegistered: string | null; // ISO date from RDAP
  mx: boolean | null;
  aiMissed?: boolean; // AI was needed but every model was busy: retry next run instead of caching
};

const UA = "DealSignalBot/0.1 (lead research; respects robots.txt)";
const SUBPAGE = /about|our-story|history|who-we-are|team|company|careers|jobs|join|contact/i;
const MAX_PAGES = 5;
const NOW = new Date().getFullYear();

async function get(url: string, ms = 8000) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(ms),
  });
  const type = res.headers.get("content-type") ?? "";
  const body = res.ok && /html|text\/plain/.test(type) ? (await res.text()).slice(0, 1_500_000) : "";
  return { ok: res.ok, status: res.status, url: res.url, body };
}

/** Disallow rules for "*" — enough to stay polite, not a full RFC 9309 parser. */
async function robotsDisallows(origin: string): Promise<string[]> {
  try {
    const { body } = await get(`${origin}/robots.txt`, 4000);
    const rules: string[] = [];
    let applies = false;
    for (const line of body.split("\n")) {
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k.trim())) applies = v === "*";
      else if (applies && /^disallow$/i.test(k.trim()) && v) rules.push(v);
    }
    return rules;
  } catch {
    return [];
  }
}

const allowed = (url: string, rules: string[]) => !rules.some((r) => new URL(url).pathname.startsWith(r));

// --- rule-based extraction -------------------------------------------------

const year = (s: string) => {
  const y = Number(s);
  return y >= 1850 && y <= NOW ? y : null;
};

function around(text: string, i: number, len: number) {
  return text.slice(Math.max(0, i - 60), i + len + 60).replace(/\s+/g, " ").trim();
}

function find<T>(text: string, source: string, re: RegExp, pick: (m: RegExpExecArray) => T | null): Evidence<T> | null {
  const m = re.exec(text);
  if (!m) return null;
  const value = pick(m);
  return value == null ? null : { value, source, quote: around(text, m.index, m[0].length), via: "site" };
}

// Capitalised words that are not names ("About Us Our founder…").
const NOT_NAME = /^(our|us|we|meet|about|contact|the|your|call|today|team|company|family|home|services?|story|history|legacy|why|who|from|with|and|for|office|offices|location|locations|area|areas|links?|info)$/i;
const FIRST_NAMES = new Set(firstNames as string[]);
const person = (name: string, title: string) =>
  name.split(" ").some((w) => NOT_NAME.test(w)) ? null : { name, title: title.toLowerCase() };

export function extract(text: string, source: string) {
  return {
    foundedYear:
      find(text, source, /(?:since|established(?: in)?|est\.?|founded(?: in)?|serving [\w\s,]{0,40} since|in business since)\s*(1[89]\d{2}|20[0-2]\d)/i, (m) => year(m[1])) ??
      find(text, source, /(?:over|more than|for)\s+(\d{2,3})\+?\s+years/i, (m) => {
        const n = Number(m[1]);
        return n >= 5 && n <= 150 ? NOW - n : null;
      }),
    copyrightYear: find(text, source, /(?:©|\(c\)|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/i, (m) => year(m[1])),
    familyOwned: find(text, source, /family[- ](?:owned|operated|run|business)|locally owned|owner[- ]operated|second[- ]generation|third[- ]generation/i, () => true as const),
    employees:
      find(text, source, /(?:team of|staff of|over|more than)\s+(\d{1,4})\+?\s+(?:employees|technicians|techs|team members|professionals|staff|people)/i, (m) => Number(m[1]) || null) ??
      find(text, source, /\b(?:our|with|employs?|of)\s+(\d{1,3})\+?\s+(?:licensed |certified |experienced |full[- ]time |trained |skilled )?(?:technicians|techs|plumbers|electricians|roofers|installers|employees|team members|crew members|professionals)\b/i, (m) => (Number(m[1]) >= 2 ? Number(m[1]) : null)),
    fleet: find(text, source, /(?:fleet of|over|more than|our)\s+(\d{1,3})\+?\s+(?:fully[- ]stocked |service |work )?(?:trucks|vans|vehicles)\b/i, (m) => (Number(m[1]) >= 2 ? Number(m[1]) : null)),
    hiring: find(text, source, /we['’]?re hiring|now hiring|join our team|career opportunities|open positions/i, () => true as const),
    multiLocation: find(text, source, /(\d{1,3})\s+(?:locations|offices|branches)/i, (m) => (Number(m[1]) > 1 ? Number(m[1]) : null)),
    ownerDependent: find(text, source, /i personally|call me directly|my name is|owner (?:is )?on (?:every|each) job|i (?:will )?(?:come out|handle) (?:every|each)/i, () => true as const),
    owner: find(text, source, /\b([A-Z][a-z]+(?: [A-Z]\.)? [A-Z][a-z]+),?\s+(?:the\s+)?(owner|founder|co-founder|president|ceo)\b/, (m) => person(m[1], m[2])) ??
      find(text, source, /\b(owner|founder|president)[:,]?\s+([A-Z][a-z]+(?: [A-Z]\.)? [A-Z][a-z]+)\b/, (m) => person(m[2], m[1])),
  };
}

/** A heading is a person if it reads "First Last" and First is a real first name (SSA list). */
export const isPersonName = (t: string) =>
  /^[A-Z][a-z]+(?: [A-Z]\.?)? [A-Z][a-z'’-]+$/.test(t) && FIRST_NAMES.has(t.split(" ")[0]) && !t.split(" ").some((w) => NOT_NAME.test(w));

/** People named in headings on a team page ("Jane Smith"), not "Roof Repair". */
function countPeople($: cheerio.CheerioAPI) {
  const names = new Set<string>();
  $("h2,h3,h4,h5,h6,strong,figcaption").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (isPersonName(t)) names.add(t);
  });
  return names.size;
}

// --- domain records ----------------------------------------------------------

async function rdapRegistered(domain: string) {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: { "User-Agent": UA, Accept: "application/rdap+json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const ev = (await res.json()).events as { eventAction: string; eventDate: string }[] | undefined;
    return ev?.find((e) => e.eventAction === "registration")?.eventDate ?? null;
  } catch {
    return null;
  }
}

const hasMx = (domain: string) =>
  resolveMx(domain).then((r) => r.length > 0, (e) => (e?.code === "ENOTFOUND" || e?.code === "ENODATA" ? false : null));

// --- AI fallback ------------------------------------------------------------

const AI_SYSTEM = `You extract facts about a small business from its website text.
Return JSON: {"ownerName": string|null, "ownerTitle": string|null, "foundedYear": number|null, "employees": number|null, "familyOwned": boolean|null, "services": string|null}.
Only use facts stated explicitly in the text. Never guess. "services" = one short line on what they do.`;

async function aiExtract(text: string, source: string, s: Signals) {
  const out = await chat(AI_SYSTEM, text.slice(0, 3500), { json: true, maxTokens: 400 });
  if (!out) {
    s.aiMissed = aiEnabled();
    return;
  }
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(out);
  } catch {
    return;
  }
  // Keep a fact only if it literally appears in the page — no hallucinated owners.
  const inText = (v: unknown) => v != null && text.includes(String(v));
  const at = (v: unknown) => around(text, text.indexOf(String(v)), String(v).length);
  if (!s.owner && typeof j.ownerName === "string" && inText(j.ownerName))
    s.owner = { value: { name: j.ownerName, title: (j.ownerTitle as string) ?? null }, source, quote: at(j.ownerName), via: "ai" };
  if (!s.foundedYear && inText(j.foundedYear) && year(String(j.foundedYear)))
    s.foundedYear = { value: Number(j.foundedYear), source, quote: at(j.foundedYear), via: "ai" };
  if (!s.employees && inText(j.employees) && Number(j.employees) > 0)
    s.employees = { value: Number(j.employees), source, quote: at(j.employees), via: "ai" };
  if (typeof j.services === "string") s.services = j.services.slice(0, 160);
}

// --- main -------------------------------------------------------------------

export async function enrich(domain: string, website: string | null): Promise<Signals> {
  const s: Signals = {
    checkedAt: new Date().toISOString(),
    siteStatus: "down",
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
    mx: null,
  };

  const records = Promise.all([rdapRegistered(domain), hasMx(domain)]);

  const start = website && /^https?:\/\//i.test(website) ? website : `https://${domain}/`;
  let home: Awaited<ReturnType<typeof get>> | null = null;
  let blocked = false;
  for (const url of [start, `http://${domain}/`]) {
    home = await get(url).catch(() => null);
    if (home?.ok) break;
    if (home && [401, 403, 429, 503].includes(home.status)) blocked = true;
  }
  s.siteStatus = home?.ok ? "ok" : blocked ? "blocked" : "down";

  if (home?.ok && home.body) {
    const origin = new URL(home.url).origin;
    const rules = await robotsDisallows(origin);
    const $ = cheerio.load(home.body);
    const links = [
      ...new Set(
        $("a[href]")
          .map((_, a) => {
            try {
              return new URL($(a).attr("href")!, home!.url).href.split("#")[0];
            } catch {
              return null;
            }
          })
          .get()
          .filter((u): u is string => !!u && u.startsWith(origin) && SUBPAGE.test(new URL(u).pathname)),
      ),
    ].slice(0, MAX_PAGES - 1);

    const pages = [{ url: home.url, html: home.body }];
    if (!allowed(home.url, rules)) s.robotsBlocked = true;
    else
      for (const u of links.filter((u) => allowed(u, rules))) {
        const p = await get(u).catch(() => null);
        if (p?.ok && p.body) pages.push({ url: p.url, html: p.body });
      }

    let aiText = "";
    for (const p of pages) {
      const $p = cheerio.load(p.html);
      $p("a[href^='mailto:']").each((_, a) => {
        const e = $p(a).attr("href")!.slice(7).split("?")[0].toLowerCase();
        if (e.includes("@") && !s.emails.includes(e)) s.emails.push(e);
      });
      if (/team|staff|about|who-we-are|people/i.test(new URL(p.url).pathname) && !s.teamListed) {
        const people = countPeople($p);
        if (people >= 3) s.teamListed = { value: people, source: p.url, quote: `${people} people listed on the team page`, via: "site" };
      }
      $p("script,style,noscript,svg").remove();
      const text = $p("body").text().replace(/\s+/g, " ");
      s.pages.push(p.url);
      const found = extract(text, p.url);
      for (const k of Object.keys(found) as (keyof typeof found)[]) {
        if (!s[k] && found[k]) (s as Record<string, unknown>)[k] = found[k];
      }
      if (/careers|jobs|join/i.test(new URL(p.url).pathname) && !s.hiring)
        s.hiring = { value: true, source: p.url, quote: "Has a careers page", via: "site" };
      if (/about|story|history|who-we-are|team/i.test(p.url) || p.url === home.url) aiText += `\n${text.slice(0, 1800)}`;
    }

    if (!s.owner || !s.foundedYear) await aiExtract(aiText.trim(), s.pages[1] ?? s.pages[0], s);
  }

  [s.domainRegistered, s.mx] = await records;
  return s;
}
