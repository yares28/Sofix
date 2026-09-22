import { chanceLabel, tableSummary, type Chances } from "../../lib/home";
import type { FixtureGrid, GridTeam } from "../../lib/types";
import Crest from "../Crest";
import HomeTile from "./HomeTile";

const badge = (team: GridTeam) => ({ code: team.code, color: team.color, crest_url: team.crest_url });
const TONES = ["var(--good)", "var(--good-2)", "#cfe9da"]; // green = a chance (DESIGN.md), strongest first
const FORM = { W: "won", D: "drew", L: "lost" } as const;

/** The title favourite's chance, the title race as one bar, the top four with form, and the likeliest to go down. */
export default function TableTile({
  grid,
  column,
  chances,
  href,
}: {
  grid: FixtureGrid;
  column: number;
  chances: Chances[] | null;
  href: string;
}) {
  const t = tableSummary(grid, column, chances);
  const lead = t.title[0];
  const leader = t.top[0];
  return (
    <HomeTile id="hm-table" title="Table" meta={t.after ? `after GW${t.after}` : "before the first game"} href={href} className="hm-table" index={2}>
      {lead ? (
        <div className="hm-hero">
          <Crest team={badge(lead.team)} size={36} />
          <div className="who">
            <b>{lead.team.name}</b>
            <span>to win the league</span>
          </div>
          <div className="num">
            <b>{chanceLabel(lead.chance).replace("%", "")}</b>
            <span>% chance</span>
          </div>
        </div>
      ) : (
        leader && (
          <div className="hm-hero">
            <Crest team={badge(leader.team)} size={36} />
            <div className="who">
              <b>{leader.team.name}</b>
              <span>top of the table</span>
            </div>
            <div className="num">
              <b>{leader.points}</b>
              <span>points</span>
            </div>
          </div>
        )
      )}

      {t.title.length > 1 && (
        <>
          <div className="hm-race" role="img" aria-label={`Chance of winning the league: ${t.title.map((c) => `${c.team.name} ${chanceLabel(c.chance)}`).join(", ")}`}>
            {t.title.map((c, i) => (
              <i key={c.team.code} style={{ flexGrow: c.chance, background: TONES[i] }} />
            ))}
          </div>
          <div className="hm-race-key" aria-hidden="true">
            {t.title.map((c, i) => (
              <span key={c.team.code}>
                <i style={{ background: TONES[i] }} />
                {c.team.code} {chanceLabel(c.chance)}
              </span>
            ))}
          </div>
        </>
      )}

      <ol className="hm-mini">
        {t.top.map((row) => (
          <li key={row.team.code}>
            <span className="pos">{row.position}</span>
            <Crest team={badge(row.team)} size={16} />
            <span className="nm">{row.team.name}</span>
            <span className="form" role="img" aria-label={`Last ${row.form.length}: ${row.form.map((o) => FORM[o]).join(", ") || "no games"}`}>
              {row.form.map((o, i) => (
                <i key={i} className={o} />
              ))}
            </span>
            <span className="pts">
              {row.points}
              <span className="visually-hidden"> points</span>
            </span>
          </li>
        ))}
      </ol>

      {t.relegation.length > 0 && (
        <>
          <h3 className="hm-subhead">
            Relegation <span>chance</span>
          </h3>
          <ol className="hm-mini hm-down">
            {t.relegation.map((c) => (
              <li key={c.team.code}>
                <Crest team={badge(c.team)} size={16} />
                <span className="nm">{c.team.name}</span>
                <span className="m" aria-hidden="true">
                  <i style={{ width: `${Math.round(c.chance * 100)}%` }} />
                </span>
                <span className="pc">{chanceLabel(c.chance)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </HomeTile>
  );
}
