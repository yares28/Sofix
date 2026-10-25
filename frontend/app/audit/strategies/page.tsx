import type { Metadata } from "next";
import AuditPlace, { type AuditSearchParams } from "../../../components/audit/AuditPlace";
import PlayPlace from "../../../components/play/PlayPlace";

export const metadata: Metadata = { title: "Strategies · Audit · Sofix" };

/** Audit · Strategies: each way of building a lineup from your cards, written down before the lock and scored after it. */
export default async function AuditStrategiesPage({ searchParams }: { searchParams: AuditSearchParams }) {
  const params = await searchParams;
  if (params.view === "plans") return <PlayPlace searchParams={Promise.resolve(params)} alternatives />;
  return <AuditPlace show="strategies" searchParams={searchParams} />;
}
