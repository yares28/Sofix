import { connection } from "next/server";
import AuditView, { type AuditShow } from "./AuditView";
import SiteNav from "../SiteNav";
import { loadGrid } from "../../lib/api";
import { loadAudit } from "../../lib/auditData";
import type { LeagueAudit } from "../../lib/leagueAudit";
import { loadSystem } from "../../lib/system";

/** The three Audit views share one page; each has its own address (plans/restructure.md, R7). */
export default async function AuditPlace({ show }: { show: AuditShow }) {
  await connection(); // "updated 2 h ago" reads the clock
  const [data, { meta }, system] = await Promise.all([loadAudit(), loadGrid(), loadSystem()]);
  const league = (await import("../../lib/data/audit_league.json")).default as unknown as LeagueAudit;
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <main className="au">
        <AuditView data={data} now={new Date()} league={league} show={show} />
      </main>
    </>
  );
}
