import type { Metadata } from "next";
import AuditPlace from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Sorare vs Sofix · Audit · Sofix" };

/** Audit · Sorare vs Sofix: both expected scores, written down before each lock, against what the player scored. */
export default function AuditVersusPage() {
  return <AuditPlace show="versus" />;
}
