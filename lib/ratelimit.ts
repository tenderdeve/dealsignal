// Fixed one-hour windows per visitor, counted in Postgres so every serverless
// instance sees the same numbers.
import { sql } from "./db";

export const LIMITS = {
  jobs: 10, // lists created per visitor per hour
  opener: 30, // openers written per visitor per hour
} as const;

/** Best-effort visitor id: the client IP as reported by the platform's proxy. */
export function visitor(req: Request) {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

/** Counts one use; returns the minutes until the window resets if over the limit, else null. */
export async function overLimit(req: Request, action: keyof typeof LIMITS) {
  const [row] = await sql`
    insert into rate_limits (key, window_start, count)
    values (${`${action}:${visitor(req)}`}, date_trunc('hour', now()), 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count, ceil(extract(epoch from (date_trunc('hour', now()) + interval '1 hour' - now())) / 60)::int as reset_in`;
  if (Math.random() < 0.05) await sql`delete from rate_limits where window_start < now() - interval '1 day'`;
  return row.count > LIMITS[action] ? (row.reset_in as number) : null;
}

export const tooMany = (minutes: number) =>
  Response.json(
    { error: `Too many requests. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` },
    { status: 429, headers: { "Retry-After": String(minutes * 60) } },
  );
