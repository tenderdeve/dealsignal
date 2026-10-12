import { neon } from "@neondatabase/serverless";

// HTTP driver: one round-trip per query, no connection pool to manage in
// serverless functions.
export const sql = neon(process.env.DATABASE_URL!);
