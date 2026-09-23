import Link from "next/link";
import type { Sorare } from "../../lib/play";
import { heroOf, railOf, syncState, type SyncState } from "../../lib/sorareStatus";

const madrid = (iso: string | Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", ...options }).format(new Date(iso));
const clock = (at: string | Date) => madrid(at, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const TONE: Record<SyncState["state"], string> = {
  fresh: "ok",
  pending: "quiet",
  waiting: "warn",
  cloudless: "bad",
  stale: "quiet",
};
const WORD: Record<SyncState["state"], string> = {
  fresh: "Fresh",
  pending: "Waiting for the cloud's first run",
  waiting: "Waiting on Sorare",
  cloudless: "Never run in the cloud",
  stale: "Locked",
};

/**
 * Is the Sorare gameweek still worth acting on? One number, the runs left before it locks, and five clocks —
 * each piece changes on its own schedule, so one "last synced" would be misleading. Design: S3-sync.html.
 */
export default function SorarePanel({ data, now }: { data: Sorare; now: Date }) {
  const week = data.next;
  const sync = syncState(data, week, now);
  if (!sync) return null;
  const tone = TONE[sync.state];
  const hero = heroOf(sync, now);
  const rail = railOf(sync);
  const live = data.timeline.find((item) => item.status === "live");
  const kept = data.status?.kept;

  const clocks: { key: string; label: string; value: string; unit: string; next: string; dot: string }[] = [
    {
      key: "cards",
      label: "Cards",
      value: String(data.cards.usable),
      unit: `of ${data.cards.total}`,
      next: "when you trade",
      dot: "slow",
    },
    {
      key: "comps",
      label: "Competitions",
      value: String(week.playable.length),
      unit: "open",
      next: "each gameweek",
      dot: "slow",
    },
    {
      key: "proj",
      label: "Projections",
      value: String(week.playing.players.length),
      unit: "players",
      next: week.source === "sorare" ? "until the lock" : "not published yet",
      dot: week.source === "sorare" ? "fast" : "warn",
    },
    {
      key: "scores",
      label: "Scores",
      value: live ? `GW${live.number}` : data.last ? `GW${data.last.gameweek.number}` : "—",
      unit: live ? "live" : "done",
      next: "during the games",
      dot: live ? "live" : "slow",
    },
    {
      key: "kept",
      label: "Kept",
      value: String(kept?.projections ?? 0),
      unit: kept?.projections === 1 ? "projection" : "projections",
      next: `${kept?.gameweeks ?? 0} gameweek${kept?.gameweeks === 1 ? "" : "s"} on record`,
      dot: "slow",
    },
  ];

  return (
    <section className={`cc-w sr-panel ${tone}`} style={{ "--i": 6 } as React.CSSProperties} aria-labelledby="sr-title">
      <div className="sr-top">
        <span className="foil limited" aria-hidden="true" />
        <b id="sr-title">Sorare</b>
        <span className="sr-who">
          {data.user} · {data.cards.total} cards
        </span>
        <span className="sr-pill">
          <i className="sr-dot" />
          {WORD[sync.state]}
        </span>
      </div>

      <div className="sr-lead">
        <div>
          <p className="sr-num">
            <b>{hero.value}</b>
            <i>{hero.unit}</i>
          </p>
          <p className="sr-cap">{hero.caption}</p>
          <span className={`sr-src${sync.state === "fresh" ? "" : " warn"}`}>
            {data.status?.where === "cloud" ? "☁" : "⌂"} {data.status?.where === "cloud" ? "the cloud" : "your PC"},{" "}
            {clock(sync.builtAt)}
          </span>
        </div>
        <div
          className="sr-run"
          role="img"
          aria-label={`Built ${clock(sync.builtAt)}; ${sync.runs.length} scheduled runs before the gameweek locks at ${clock(sync.lock)}`}
        >
          <span className="trk" />
          <span className="fil" style={{ width: `${rail.filter((m) => m.done).pop()?.at ?? 0}%` }} />
          {rail.map((mark, index) => (
            <span key={`${mark.label}-${index}`}>
              <i className={`p${mark.done ? " on" : ""}${mark.lock ? " lock" : ""}`} style={{ left: `${mark.at}%` }} />
              {index === 0 || mark.lock ? (
                <em className="a" style={{ left: `${mark.at}%` }}>
                  {mark.label}
                </em>
              ) : null}
            </span>
          ))}
          <em className="b" style={{ left: "3%" }}>
            built
          </em>
          <em className="b" style={{ left: "100%" }}>
            lock
          </em>
        </div>
      </div>

      {sync.alert ? (
        <div className="sr-alert">
          <span aria-hidden="true">{sync.state === "cloudless" ? "!" : "⟳"}</span>
          <div>
            <b>{sync.alert.title}</b>
            {sync.alert.detail}
          </div>
          <Link className="sr-go" href={sync.alert.href} prefetch={false}>
            {sync.alert.action}
          </Link>
        </div>
      ) : null}

      <div className="sr-clocks">
        {clocks.map((item, index) => (
          <div className="sr-clock" key={item.key} style={{ "--i": index } as React.CSSProperties}>
            <span className="k">
              <s className={item.dot} />
              {item.label}
            </span>
            <b>
              {item.value}
              <em>{item.unit}</em>
            </b>
            <span className="n">{item.next}</span>
          </div>
        ))}
      </div>

      <div className="sr-stats">
        <span>
          <b>{kept?.rows ?? 0}</b> rows kept
        </span>
        <span>
          <b>{kept?.scored ?? 0}</b> scored
        </span>
        <span>
          <b>{data.status?.moved ?? 0}</b> moved since the run before
        </span>
        <Link href="/play" prefetch={false}>
          Open Play →
        </Link>
      </div>
    </section>
  );
}
