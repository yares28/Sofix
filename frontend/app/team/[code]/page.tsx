import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Crest from "../../../components/Crest";
import SiteNav from "../../../components/SiteNav";
import TeamSeason from "../../../components/TeamSeason";
import { loadGrid } from "../../../lib/api";
import { loadSystem } from "../../../lib/system";
import { findTeam } from "../../../lib/team";

type Params = Promise<{ code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ code }, { grid }] = await Promise.all([params, loadGrid()]);
  const team = grid ? findTeam(grid, code) : null;
  return { title: team ? `${team.name} fixtures · Sofix` : "Team · Sofix" };
}

export default async function TeamPage({ params }: { params: Params }) {
  await connection();
  const [{ code }, { grid, meta, error }, system] = await Promise.all([params, loadGrid(), loadSystem()]);

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
  const team = /^[A-Za-z0-9]{3}$/.test(code) ? findTeam(grid, code) : null;
  if (!team) notFound();

  return (
    <>
      <SiteNav meta={meta} system={system} />
      <main className="team-page">
        <Link href="/difficulty" className="back-link">
          ← All fixtures
        </Link>
        <section className="team-hero">
          <Crest team={team} size={52} />
          <div>
            <div className="eyebrow">LaLiga · Season {grid.season}</div>
            <h1>{team.name}</h1>
          </div>
        </section>
        <TeamSeason grid={grid} team={team} />
      </main>
    </>
  );
}
