import type { Metadata } from "next";
import { connection } from "next/server";
import AuditView from "../../components/audit/AuditView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadAudit } from "../../lib/auditData";
import type { LeagueAudit } from "../../lib/leagueAudit";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Audit · Sofix" };

/**
 * Audit: how often Sofix's numbers were right, checked against what happened. One figure leads (how often the xScore picks the better
 * of two players), then which of Futbol Fantasy, Sorare and Sofix was right about who starts. The job writes the numbers
 * (backend/app/sorare/audit.py); this page only draws them, and says "too few to tell" where the job gave no figure.
 */
export default async function AuditPage() {
  await connection(); // "updated 2 h ago" reads the clock
  const [data, { meta }, system] = await Promise.all([loadAudit(), loadGrid(), loadSystem()]);
  const league = (await import("../../lib/data/audit_league.json")).default as unknown as LeagueAudit;
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <main className="au">
        <AuditView data={data} now={new Date()} league={league} />
      </main>
    </>
  );
}
