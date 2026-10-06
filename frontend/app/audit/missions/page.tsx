import type { Metadata } from "next";
import AuditPlace from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Missions · Audit · Sofix" };

/** Audit · Missions: how often Sofix's picks for the daily missions were the best your cards could have done that day. */
export default function AuditMissionsPage() {
  return <AuditPlace show="missions" />;
}
