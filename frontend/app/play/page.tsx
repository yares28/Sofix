import type { Metadata } from "next";
import PlayPlace from "../../components/play/PlayPlace";

export const metadata: Metadata = { title: "Play · Sofix" };

export default function Play({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <PlayPlace searchParams={searchParams} />;
}
