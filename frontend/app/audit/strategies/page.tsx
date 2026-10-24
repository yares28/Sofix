import type { Metadata } from "next";
import AuditPlace, { type AuditSearchParams } from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Strategies · Audit · Sofix" };

/** Audit · Strategies: each way of building a lineup from your cards, written down before the lock and scored after it. */
export default function AuditStrategiesPage({ searchParams }: { searchParams: AuditSearchParams }) {
  return <AuditPlace show="strategies" searchParams={searchParams} />;
}
