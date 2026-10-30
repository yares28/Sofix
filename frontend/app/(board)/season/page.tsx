import type { Metadata } from "next";
import Link from "../../../components/navigation/NavigationLink";
import { connection } from "next/server";
import EuropeFixtures from "../../../components/EuropeFixtures";
import FixturesList from "../../../components/FixturesList";
import SiteNav from "../../../components/SiteNav";
import { loadGrid } from "../../../lib/api";
import { europeGames } from "../../../lib/europe";
import { weekPlan } from "../../../lib/play";
import { loadFrozenPlan, loadSorare } from "../../../lib/playData";
import { loadSystem } from "../../../lib/system";
import { weekContext, weekDates } from "../../../lib/weeks";
import { BoardRoute, type SearchParams } from "../board-route";
import CompetitionPicker from "../../../components/CompetitionPicker";

export const metadata: Metadata = { title: "Season fixtures · Sofix" };

/**
 * The fixtures of the week the top bar holds (the week you're in by default): its LaLiga round, if it has one, and the
 * Champions, Europa and Conference League games of clubs holding one of your players. A week with no round shows no
 * round: never the next week's. The chips step through every round.
 */
export default async function Season({ searchParams }: { searchParams: SearchParams }) {
  const requested = await searchParams;
  if (requested.league !== undefined) return BoardRoute({ view: "plain", searchParams });
  await connection();
  const [{ grid, meta, error }, params, system, sorare] = await Promise.all([loadGrid(), searchParams, loadSystem(), loadSorare()]);
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : null);
  const week = weekContext(grid, sorare, new Date(), { w: one("w"), md: Number(one("md")) || null });
  const current = week.current;
  const round = grid && current?.md != null ? grid.matchdays.findIndex((md) => md.number === current.md) : -1;
  const info = sorare?.timeline.find((item) => item.id === current?.gw);
  const plan = sorare && current?.gw ? (weekPlan(sorare, current.gw) ?? (info ? await loadFrozenPlan(info.slug, sorare) : null)) : null;
  const europe = current ? europeGames(plan, current, week.weeks) : [];
  return (
    <>
      <SiteNav meta={meta} system={system} week={week} />
      <main>
        <CompetitionPicker competition="PD" week={week.current?.id} through={week.current?.to} />
        <section className="hero">
          <div>
            <div className="eyebrow">LaLiga & Europe · {current ? weekDates(current) : `Season ${grid?.season ?? ""}`}</div>
            <h1>Fixtures</h1>
          </div>
        </section>
        {grid ? (
          <>
            <nav className="season-jump" aria-label="Rounds">
              {grid.matchdays.map((md, index) => (
                <Link key={md.number} href={`/season?md=${md.number}`} aria-current={index === round ? "true" : undefined} className={md.finished ? "done" : undefined}>
                  {md.number}
                </Link>
              ))}
            </nav>
            {round >= 0 ? (
              <div className="season-round">
                <FixturesList grid={grid} column={round} tag="LaLiga" />
              </div>
            ) : null}
            {europe.length ? (
              <div className="season-round">
                <EuropeFixtures games={europe} />
              </div>
            ) : null}
            {round < 0 && !europe.length ? (
              <section className="card empty-state" role="status">
                <p>No LaLiga round this week, and none of your players&apos; clubs plays in Europe.</p>
              </section>
            ) : null}
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
