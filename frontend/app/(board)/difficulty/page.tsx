import type { Metadata } from "next";
import { BoardRoute, type SearchParams } from "../board-route";

export const metadata: Metadata = { title: "Difficulty · Sofix" };

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <BoardRoute view="fdr" searchParams={searchParams} />;
}
