import type { Metadata } from "next";
import AuditPlace from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Who starts · Audit · Sofix" };

export default function Page() {
  return <AuditPlace show="starts" />;
}
