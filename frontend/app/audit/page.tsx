import type { Metadata } from "next";
import AuditPlace, { type AuditSearchParams } from "../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Audit · Sofix" };

/** Audit · xScore: how often the xScore picks the better of two players. */
export default function AuditPage({ searchParams }: { searchParams: AuditSearchParams }) {
  return <AuditPlace show="xscore" searchParams={searchParams} />;
}
