import type { Metadata } from "next";
import AuditPlace from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Lineups · Audit · Sofix" };

/** Audit · Lineups: how often a lineup won a reward, yours and Sofix's. */
export default function AuditLineupsPage() {
  return <AuditPlace show="lineups" />;
}
