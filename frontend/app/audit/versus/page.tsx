import { redirect } from "next/navigation";
import type { AuditSearchParams } from "../../../components/audit/AuditPlace";

/** Sorare vs Sofix leads the first Audit view now (12 Oct 2026); an old link lands on it with its week. */
export default async function Page({ searchParams }: { searchParams: AuditSearchParams }) {
  const query = new URLSearchParams(Object.entries(await searchParams).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : []))).toString();
  redirect(query ? `/audit?${query}` : "/audit");
}
