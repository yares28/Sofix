import type { Metadata } from "next";
import AuditPlace from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Strategies · Audit · Sofix" };

/** Audit · Strategies: each way of building a lineup from your cards, written down before the lock and scored after it. */
export default function AuditStrategiesPage() {
  return <AuditPlace show="strategies" />;
}
