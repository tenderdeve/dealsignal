// Applies db/schema.sql. Run: npm run db:migrate
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);
const schema = readFileSync("db/schema.sql", "utf8").replace(/--.*$/gm, "");
for (const stmt of schema.split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt);
console.log("schema applied");
