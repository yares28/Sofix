import type { Metadata } from "next";
import { BoardRoute, type SearchParams } from "../board-route";

export const metadata: Metadata = { title: "Table · Sofix" };

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <BoardRoute view="table" searchParams={searchParams} />;
}
