import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import FixturesList from "../../../components/FixturesList";
import SiteNav from "../../../components/SiteNav";
import { loadGrid } from "../../../lib/api";
import { openingColumn } from "../../../lib/grid";
import { loadSorare } from "../../../lib/playData";
import { loadSystem } from "../../../lib/system";
import { weekContext } from "../../../lib/weeks";
import type { SearchParams } from "../board-route";

export const metadata: Metadata = { title: "Season fixtures · Sofix" };

/** The fixtures of the round in the week the top bar holds (the week you're in by default); the chips step through every other round. */
export default async function Season({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const [{ grid, meta, error }, params, system, sorare] = await Promise.all([loadGrid(), searchParams, loadSystem(), loadSorare()]);
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null);
  const md = Number(one("md")) || null;
  const week = weekContext(grid, sorare, new Date(), { w: one("w"), md });
  const picked = grid ? grid.matchdays.findIndex((round) => round.number === week.current?.md) : -1;
  const shown = picked >= 0 ? picked : grid ? openingColumn(grid) : 0; // a week with no LaLiga round opens on the round in play
  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main>
        <section className="hero">
          <div>
            <div className="eyebrow">LaLiga · Season {grid?.season ?? ""}</div>
            <h1>Fixtures</h1>
          </div>
        </section>
        {grid ? (
          <>
            <nav className="season-jump" aria-label="Rounds">
              {grid.matchdays.map((round, index) => (
                <Link key={round.number} href={`/season?md=${round.number}`} aria-current={index === shown ? "true" : undefined} className={round.finished ? "done" : undefined}>
                  {round.number}
                </Link>
              ))}
            </nav>
            <div className="season-round">
              <FixturesList grid={grid} column={shown} />
            </div>
          </>
        ) : (
          <section className="card empty-state" role="status">
            <p>{error}</p>
          </section>
        )}
      </main>
    </>
  );
}
