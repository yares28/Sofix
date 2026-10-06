import type { Metadata } from "next";
import AuditPlace from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Rewards · Audit · Sofix" };

/** Audit · Rewards: the essence Sofix's plans expected over the season (chance x reward), against what they and you really won. */
export default function AuditRewardsPage() {
  return <AuditPlace show="rewards" />;
}
