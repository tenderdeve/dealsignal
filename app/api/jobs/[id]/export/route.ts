import Papa from "papaparse";
import { loadJob, UUID } from "@/lib/jobs";

/** ?format=csv (full detail) or ?format=hubspot (HubSpot company import). Dropped leads are left out. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = UUID.test(id) ? await loadJob(id) : null;
  if (!data) return new Response("Not found", { status: 404 });
  const hubspot = new URL(req.url).searchParams.get("format") === "hubspot";
  const rows = data.rows.filter((r) => r.score.tier !== "dropped");

  const out = rows.map(({ lead: l, signals: s, score: sc, opener }) => {
    const reasons = sc.reasons.map((r) => r.text).join("; ");
    const founded = s?.foundedYear?.value ?? l.yearFounded ?? "";
    // HubSpot gets a revenue only when it is company-specific, never an industry average.
    const revenue = sc.revenue?.basis === "company" ? Math.round((sc.revenue.low + sc.revenue.high) / 2) : "";
    return hubspot
      ? {
          Name: l.company,
          "Company Domain Name": l.domain ?? "",
          "Phone Number": l.phone ?? "",
          City: l.city ?? "",
          "State/Region": l.state ?? "",
          Industry: l.industry ?? "",
          "Year Founded": founded,
          "Annual Revenue": revenue,
          Description: [s?.services, reasons].filter(Boolean).join(" | "),
          "Lead Status": `DealSignal Tier ${sc.tier}`,
        }
      : {
          Tier: sc.tier,
          Company: l.company,
          Industry: l.industry ?? "",
          City: l.city ?? "",
          State: l.state ?? "",
          Phone: l.phone ?? "",
          Website: l.website ?? "",
          Email: s?.emails.join(", ") ?? "",
          Owner: s?.owner?.value.name ?? "",
          "Year Founded": founded,
          "Years in Business": sc.yearsInBusiness ?? "",
          "Revenue Low": sc.revenue ? Math.round(sc.revenue.low) : "",
          "Revenue High": sc.revenue ? Math.round(sc.revenue.high) : "",
          "Revenue Basis": sc.revenue?.basis === "typical" ? "industry typical" : sc.revenue ? "company" : "",
          "Revenue Method": sc.revenue?.method ?? "",
          Fit: sc.fit,
          Readiness: sc.readiness,
          Confidence: sc.confidence,
          Reasons: reasons,
          Opener: opener ?? "",
          Sources: l.sources.join(", "),
        };
  });

  const name = `dealsignal-${hubspot ? "hubspot" : "leads"}.csv`;
  return new Response(Papa.unparse(out), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
