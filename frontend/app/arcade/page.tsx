import type { Metadata } from "next";
import ArcadeView from "../../components/arcade/ArcadeView";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Arcade · Sofix" };

/** Arcade (plans/set.md): your free common-card board. Everything on it is read in your browser from your Sorare tab. */
export default async function ArcadePage() {
  const [{ meta }, system] = await Promise.all([loadGrid(), loadSystem()]);
  return (
    <>
      <SiteNav meta={meta} system={system} />
      <ArcadeView />
    </>
  );
}
