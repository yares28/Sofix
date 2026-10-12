import type { Metadata } from "next";
import LineupsPage, { type SearchParams } from "../../components/lineups/LineupsPage";

export const metadata: Metadata = { title: "Lineups · Sofix" };

/** Who is expected to start: components/lineups/LineupsPage.tsx. */
export default function Lineups({ searchParams }: { searchParams: SearchParams }) {
  return <LineupsPage searchParams={searchParams} />;
}
