import type { Metadata } from "next";
import Link from "../../../components/navigation/NavigationLink";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Crest from "../../../components/Crest";
import SiteNav from "../../../components/SiteNav";
import TeamSeason from "../../../components/TeamSeason";
import { loadGrid } from "../../../lib/api";
import { loadSystem } from "../../../lib/system";
import { findTeam } from "../../../lib/team";
import { competitionOf, leagueName } from "../../../lib/competitions";

type Params = Promise<{ code: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const [{ code }, { grid }] = await Promise.all([params, searchParams.then(p => loadGrid(competitionOf(p.league)))]);
  const team = grid ? findTeam(grid, code) : null;
  return { title: team ? `${team.name} fixtures · Sofix` : "Team · Sofix" };
}

export default async function TeamPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const [{ code }, { grid, meta, error }, system, search] = await Promise.all([params, searchParams.then(p => loadGrid(competitionOf(p.league))), loadSystem(), searchParams]);

  if (!grid) {
    return (
      <>
        <SiteNav meta={meta} system={system} />
        <main>
          <section className="card empty-state">
            <h1>Team</h1>
            <p>{error}</p>
          </section>
        </main>
      </>
    );
  }
  const team = /^[A-Za-z0-9]{2,8}$/.test(code) ? findTeam(grid, code) : null;
  if (!team) notFound();

  return (
    <>
      <SiteNav meta={meta} system={system} />
      <main className="team-page">
        <Link href={`/difficulty?${new URLSearchParams(Object.entries(search).filter((entry): entry is [string, string] => typeof entry[1] === "string"))}`} className="back-link">
          ← All fixtures
        </Link>
        <section className="team-hero">
          <Crest team={team} size={52} />
          <div>
            <div className="eyebrow">{leagueName(grid)} · Season {grid.season}</div>
            <h1>{team.name}</h1>
          </div>
        </section>
        {grid.competition === "CONF" && <p role="note">Conference FDR and xScore are provisional. The extra benefit of opponent information remains uncertain.</p>}
        <TeamSeason grid={grid} team={team} />
      </main>
    </>
  );
}
