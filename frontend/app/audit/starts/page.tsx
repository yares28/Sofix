import type { Metadata } from "next";
import AuditPlace, { type AuditSearchParams } from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Who starts · Audit · Sofix" };

export default function Page({ searchParams }: { searchParams: AuditSearchParams }) {
  return <AuditPlace show="starts" searchParams={searchParams} />;
}
