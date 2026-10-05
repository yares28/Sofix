import type { Metadata } from "next";
import AuditPlace from "../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Audit · Sofix" };

/** Audit · xScore: how often the xScore picks the better of two players. */
export default function AuditPage() {
  return <AuditPlace show="xscore" />;
}
