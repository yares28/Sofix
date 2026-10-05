import type { Metadata } from "next";
import { connection } from "next/server";
import FixturesList from "../../../components/FixturesList";
import ScrollToRound from "../../../components/ScrollToRound";
import SiteNav from "../../../components/SiteNav";
import { loadGrid } from "../../../lib/api";
import { openingColumn } from "../../../lib/grid";
import { loadSorare } from "../../../lib/playData";
import { loadSystem } from "../../../lib/system";
import { weekContext } from "../../../lib/weeks";

export const metadata: Metadata = { title: "Season fixtures · Sofix" };

/** Every round of the season, fixtures and results by day, with the round in play first in reach (plans/restructure.md, R5). */
export default async function Season() {
  await connection();
  const [{ grid, meta, error }, system, sorare] = await Promise.all([loadGrid(), loadSystem(), loadSorare()]);
  const week = weekContext(grid, sorare, new Date(), {});
  const opening = grid ? openingColumn(grid) : 0;
  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main>
        <section className="hero">
          <div>
            <div className="eyebrow">LaLiga · Season {grid?.season ?? ""}</div>
            <h1>All fixtures</h1>
          </div>
        </section>
        {grid ? (
          <>
            <nav className="season-jump" aria-label="Rounds">
              {grid.matchdays.map((md, index) => (
                <a key={md.number} href={`#round-${md.number}`} aria-current={index === opening ? "true" : undefined} className={md.finished ? "done" : undefined}>
                  {md.number}
                </a>
              ))}
            </nav>
            {grid.matchdays[opening] ? <ScrollToRound id={`round-${grid.matchdays[opening].number}`} /> : null}
            <div className="season-rounds">
              {grid.matchdays.map((md, index) => (
                <div key={md.number} id={`round-${md.number}`} className="season-round">
                  <FixturesList grid={grid} column={index} />
                </div>
              ))}
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
