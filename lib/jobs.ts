// Job storage + the batch worker. The browser drives processing by calling
// /process repeatedly, so no background queue or cron is needed.
import { sql } from "./db";
import { enrich, type Signals } from "./enrich";
import type { Field, Lead } from "./normalize";
import { scoreLead, type BuyBox, type Score } from "./score";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 6;

export type Row = { id: number; lead: Lead; signals: Signals | null; opener: string | null; status: string; score: Score };

export async function createJob(fileName: string, buyBox: BuyBox, rowsIn: number, columns: Partial<Record<Field, string>>, leads: Lead[], duplicates: number) {
  const [job] = await sql`
    insert into jobs (file_name, buy_box, rows_in, duplicates, columns)
    values (${fileName}, ${JSON.stringify(buyBox)}, ${rowsIn}, ${duplicates}, ${JSON.stringify(columns)})
    returning id`;
  await sql`
    insert into leads (job_id, lead, domain, status)
    select ${job.id}, x, x->>'domain', case when x->>'domain' is null then 'done' else 'pending' end
    from jsonb_array_elements(${JSON.stringify(leads)}::jsonb) x`;
  return job.id as string;
}

/** Claims a few pending leads (or ones stuck >6 min) and enriches them. */
export async function processBatch(jobId: string) {
  // One batch in flight per job: extra callers (another tab, a script firing requests
  // in parallel) just report progress instead of multiplying the crawling.
  const [busy] = await sql`select 1 from leads where job_id = ${jobId} and status = 'working' and updated_at > now() - interval '6 minutes' limit 1`;
  const claimed = busy ? [] : ((await sql`
    update leads set status = 'working', updated_at = now()
    where id in (
      select id from leads
      where job_id = ${jobId} and (status = 'pending' or (status = 'working' and updated_at < now() - interval '6 minutes'))
      order by id limit ${BATCH} for update skip locked)
    returning id, domain, lead`) as { id: number; domain: string; lead: Lead }[]);

  await Promise.all(
    claimed.map(async ({ id, domain, lead }) => {
      const [hit] = await sql`select signals from domain_cache where domain = ${domain} and fetched_at > now() - interval '7 days'`;
      let signals: Signals;
      try {
        signals = hit?.signals ?? (await enrich(domain, lead.website));
      } catch (e) {
        // One broken site must never stall the whole list: score it with what the CSV had.
        console.error(`enrich failed for ${domain}:`, e);
        await sql`update leads set status = 'done', updated_at = now() where id = ${id}`;
        return;
      }
      // Don't cache a result the AI couldn't finish, so the next run fills the gap.
      if (!hit && !signals.aiMissed)
        await sql`
          insert into domain_cache (domain, signals) values (${domain}, ${JSON.stringify(signals)})
          on conflict (domain) do update set signals = excluded.signals, fetched_at = now()`;
      await sql`update leads set signals = ${JSON.stringify(signals)}, status = 'done', updated_at = now() where id = ${id}`;
    }),
  );

  const [p] = await sql`
    select count(*) filter (where status <> 'done')::int as remaining, count(*)::int as total
    from leads where job_id = ${jobId}`;
  return { processed: claimed.length, remaining: p.remaining as number, total: p.total as number };
}

const TIER_ORDER = { A: 0, B: 1, C: 2, dropped: 3 };

export async function loadJob(jobId: string) {
  const [job] = await sql`select id, created_at, file_name, buy_box, rows_in, duplicates, columns from jobs where id = ${jobId}`;
  if (!job) return null;
  const raw = await sql`select id, lead, signals, opener, status from leads where job_id = ${jobId}`;
  const box = job.buy_box as BuyBox;
  const rows: Row[] = raw
    .map((r) => ({ ...(r as Omit<Row, "score">), score: scoreLead(r.lead, r.signals, box) }))
    .sort((a, b) => TIER_ORDER[a.score.tier] - TIER_ORDER[b.score.tier] || b.score.fit + b.score.readiness - (a.score.fit + a.score.readiness));

  // How much of the list was filled in by enrichment (the "N/A" problem).
  const done = rows.filter((r) => r.status === "done");
  const pct = (n: number) => (done.length ? Math.round((n / done.length) * 100) : 0);
  const filled = {
    yearFounded: [pct(done.filter((r) => r.lead.yearFounded).length), pct(done.filter((r) => r.score.yearsInBusiness != null).length)],
    owner: [0, pct(done.filter((r) => r.signals?.owner).length)],
    revenue: [pct(done.filter((r) => r.lead.revenue || r.lead.employees).length), pct(done.filter((r) => r.score.revenue?.basis === "company").length)],
    email: [0, pct(done.filter((r) => r.signals?.emails.length).length)],
  };
  const count = (t: string) => rows.filter((r) => r.status === "done" && r.score.tier === t).length;
  return {
    job,
    rows,
    stats: {
      rowsIn: job.rows_in as number,
      duplicates: job.duplicates as number,
      leads: rows.length,
      done: done.length,
      tiers: { A: count("A"), B: count("B"), C: count("C"), dropped: count("dropped") },
      filled,
    },
  };
}
