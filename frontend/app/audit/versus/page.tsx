import type { Metadata } from "next";
import AuditPlace, { type AuditSearchParams } from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Sorare vs Sofix · Audit · Sofix" };

/** Audit · Sorare vs Sofix: both expected scores, written down before each lock, against what the player scored. */
export default function AuditVersusPage({ searchParams }: { searchParams: AuditSearchParams }) {
  return <AuditPlace show="versus" searchParams={searchParams} />;
}
