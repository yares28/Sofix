import type { Played } from "../../lib/missionColumns";

const day = (d: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

/** His last ten games as dots, oldest first: a big dot he started, a small one he came on, green when he did what the mission asks. */
export default function Dots({ games, small = false, count = 10 }: { games: Played[]; small?: boolean; count?: number }) {
  const hits = games.filter((g) => g.hit).length;
  const unknown = games.filter((g) => g.hit === null).length;
  return <span className={`mx-dots${small ? " s" : ""}`} role="img" aria-label={games.length ? `Last ${games.length} games: ${hits} hit${unknown ? `, ${unknown} unknown` : ""}` : "No recent games recorded"}>
    {Array.from({ length: Math.max(0, count - games.length) }, (_, i) => <i key={`pad${i}`} className="x" />)}
    {games.map((g, i) => <i key={`${g.date}:${i}`} className={`${g.started === false ? "b " : ""}${g.hit === null ? "u" : g.hit ? "h" : ""}`} title={`${day(g.date.slice(0, 10))} · ${g.started === false ? "came on" : "started"}${g.hit === null ? " · stats unavailable" : g.hit ? " · hit" : ""}`} />)}
  </span>;
}
