import { difficultyMosaic, type MosaicCell } from "../../lib/home";
import type { FixtureGrid, GridTeam } from "../../lib/types";
import Crest from "../Crest";
import HomeTile from "./HomeTile";

const badge = (team: GridTeam) => ({ code: team.code, color: team.color, crest_url: team.crest_url });

function Cell({ cell }: { cell: MosaicCell }) {
  if (cell.kind === "game") {
    return <i className={`${cell.bucket ? `f${cell.bucket}` : "nf"}${cell.games > 1 ? " dbl" : ""}`} />;
  }
  return <i className={cell.kind === "played" ? "pl" : cell.kind === "postponed" ? "pp" : "bl"} />;
}

/**
 * The easiest run as the tile's number, then every club's next five games as one mosaic in the board's colours,
 * most expected points first, and the hardest run named at the bottom.
 */
export default function DifficultyTile({ grid, column, href }: { grid: FixtureGrid; column: number; href: string }) {
  const { gameweeks, rows } = difficultyMosaic(grid, column);
  const rated = rows.filter((row) => row.total !== null);
  const top = rated[0];
  const bottom = rated[rated.length - 1];
  const span = gameweeks.length > 1 ? `GW${gameweeks[0]}–GW${gameweeks[gameweeks.length - 1]}` : `GW${gameweeks[0] ?? ""}`;
  return (
    <HomeTile id="hm-difficulty" title="Difficulty" meta={span} href={href} className="hm-difficulty" index={1}>
      {top && bottom && top !== bottom ? (
        <>
          <div className="hm-hero">
            <Crest team={badge(top.team)} size={36} />
            <div className="who">
              <b>{top.team.name}</b>
              <span>easiest run</span>
            </div>
            <div className="num">
              <b>{top.total!.toFixed(1)}</b>
              <span>expected points</span>
            </div>
          </div>
          <div
            className="hm-mosaic"
            role="img"
            aria-label={`Every club's games in ${span} coloured by difficulty, easiest run first: ${rated
              .map((row) => `${row.team.name} ${row.total!.toFixed(1)}`)
              .join(", ")}`}
            style={{ "--cols": gameweeks.length } as React.CSSProperties}
          >
            <div className="m-row hd" aria-hidden="true">
              <span />
              {gameweeks.map((number) => (
                <span key={number}>{number}</span>
              ))}
              <span />
            </div>
            {rows.map((row, i) => (
              <div
                key={row.team.code}
                className={`m-row${row === top ? " top" : row === bottom ? " bottom" : ""}`}
                style={{ "--r": i } as React.CSSProperties}
                aria-hidden="true"
              >
                <span className="code">{row.team.code}</span>
                {row.cells.map((cell, c) => (
                  <Cell key={c} cell={cell} />
                ))}
                <span className="xp">{row.total === null ? "–" : row.total.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <div className="hm-foot">
            Hardest <Crest team={badge(bottom.team)} size={16} /> {bottom.team.name}
            <b className="push">{bottom.total!.toFixed(1)}</b>
          </div>
        </>
      ) : (
        <p className="hm-empty">No games left to rate from this gameweek.</p>
      )}
    </HomeTile>
  );
}
