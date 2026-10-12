import type { Metadata } from "next";
import LineupsPage, { type SearchParams } from "../../components/lineups/LineupsPage";

export const metadata: Metadata = { title: "Scores · Sofix" };

/** The Lineups page drawn with what each player scored, and what Sofix and Sorare expected of him. */
export default function Scores({ searchParams }: { searchParams: SearchParams }) {
  return <LineupsPage searchParams={searchParams} scores />;
}
