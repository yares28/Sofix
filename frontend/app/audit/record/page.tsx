import type { Metadata } from "next";
import AuditPlace from "../../../components/audit/AuditPlace";

export const metadata: Metadata = { title: "Written down · Audit · Sofix" };

export default function Page() {
  return <AuditPlace show="record" />;
}
