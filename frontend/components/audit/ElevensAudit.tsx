import { percent, SOURCES, type ElevenSources, type Elevens } from "../../lib/audit";
import type { StartSource } from "../../lib/play";
import Shield from "../lineups/Shield";

const NAMES: Record<StartSource, string> = { futbolfantasy: "Futbol Fantasy", sorare: "Sorare", sofix: "Sofix" };

function Table({ rows, caption, floor }: { rows: { name: string; crest?: string | null; sources: ElevenSources }[]; caption: string; floor: number }) {
  return (
    <table className="au-vs-t au-eleven-t">
      <caption className="visually-hidden">{caption}</caption>
      <thead><tr><th scope="col">{caption}</th>{SOURCES.map((source) => <th scope="col" key={source}>{NAMES[source]}</th>)}</tr></thead>
      <tbody>{rows.map(({ name, crest, sources }) => (
        <tr key={name}>
          <th scope="row">{crest ? <Shield crest={crest} code={name} width={18} /> : null}{name}</th>
          {SOURCES.map((source) => {
            const cell = sources[source];
            return <td key={source}>
              <span>{cell.checked >= floor && cell.rate !== null ? percent(cell.rate) : cell.checked ? "Too few to tell" : "Waiting for results"}</span>
              <small>{cell.started.toLocaleString("en-GB")} of {cell.checked.toLocaleString("en-GB")} started</small>
              <small>{cell.picked.toLocaleString("en-GB")} picked</small>
            </td>;
          })}
        </tr>
      ))}</tbody>
    </table>
  );
}

export default function ElevensAudit({ data, floor }: { data: Elevens; floor: number }) {
  const any = SOURCES.some((source) => data.all[source].picked > 0);
  return (
    <section className="au-w au-starts" aria-labelledby="au-eleven-h">
      <h2 id="au-eleven-h">Futbol Fantasy&apos;s eleven</h2>
      <p className="au-sub">How many predicted starters started. Sorare and Sofix reorder the same formation by their saved start chances. Readings stay frozen at the lock.</p>
      {any ? <>
        <Table caption="All games" rows={[{ name: "All", sources: data.all }]} floor={floor} />
        <details className="au-eleven-more"><summary>By gameweek and club</summary>
          <Table caption="Gameweek" rows={data.weeks.map((week) => ({ name: `GW${week.week}`, sources: week.sources }))} floor={floor} />
          <Table caption="Club" rows={data.clubs.map((club) => ({ name: club.club, crest: club.crest, sources: club.sources }))} floor={floor} />
        </details>
      </> : <p className="au-sub">No predicted elevens kept yet. The comparison starts with the next saved reading before a lock.</p>}
    </section>
  );
}
