"use client";

import { ResponsiveCirclePacking, type CirclePackingCustomLayerProps, type ComputedDatum } from "@nivo/circle-packing";
import { useMemo, useRef, useState } from "react";
import { chartLabel, chartValue, clubShares, LEAGUES, type ChartPlayer, type ChartWindow, type Position } from "../../lib/statCharts";
import { LeagueMenu, PlayerPop, POS_COLOR, StatSelect, useDark } from "./chartParts";

type Datum = { id: string; value?: number; children?: Datum[]; player?: ChartPlayer; share?: number; crest?: string | null; top?: boolean };
const pct = (share: number) => `${Math.round(share * 100)}%`;

/** Each club's crest on the top of its bubble; notes where the middle is, so a card opens on the roomier side. */
const crests = (middle: { current: number }) => function Crests({ nodes }: CirclePackingCustomLayerProps<Datum>) {
  middle.current = nodes.find((n) => n.depth === 0)?.x ?? middle.current;
  return (
    <g aria-hidden="true">
      {nodes.filter((n) => n.depth === 1 && n.data.crest).map((n) => {
        const size = Math.max(16, Math.min(30, n.radius * 0.24));
        return <image key={n.id} href={n.data.crest!} x={n.x - size / 2} y={n.y - n.radius - size * 0.35} width={size} height={size} />;
      })}
    </g>
  );
};

/** Who carries the club: every club a bubble of its players, each sized by what he does of the stat per start. */
export default function ClubsChart({ data }: { data: ChartWindow }) {
  const dark = useDark();
  const [league, setLeague] = useState("LaLiga");
  const [stat, setStat] = useState("won_tackle");
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [hover, setHover] = useState<ComputedDatum<Datum> | null>(null);
  const middle = useRef(500);
  const clubs = useMemo(() => clubShares(data, league, stat), [data, league, stat]);
  const counts = useMemo(() => Object.fromEntries(LEAGUES.map((l) => [l, clubShares(data, l, stat).length])), [data, stat]);
  const tree = useMemo<Datum>(() => ({
    id: "clubs",
    children: clubs.map((club) => ({
      id: club.name,
      crest: club.crest,
      children: club.players.map((p, i) => ({ id: `${club.name}/${p.player.slug}`, value: p.value, player: p.player, share: p.share, top: i === 0 })),
    })),
  }), [clubs]);
  const clubFill = dark ? "#202024" : "#f4f4f7";
  const shown = hover?.data.player ? hover : null;
  const reset = () => { setZoomed(null); setHover(null); };

  return (
    <div className="sc-clubs">
      <div className="sc-filters">
        <StatSelect className="sc-select" label="Stat" value={stat} onChange={(k) => { setStat(k); setHover(null); }} keys={data.keys} withAverage={false} />
        <LeagueMenu value={league} counts={counts} all={false} onChange={(l) => { setLeague(l); reset(); }} />
        {zoomed ? (
          <button type="button" className="sc-back" onClick={reset}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2L4 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Every club
          </button>
        ) : null}
      </div>
      <div className="sc-plot sc-plot-pack" onMouseLeave={() => setHover(null)}>
        {!clubs.length ? <p className="sc-empty" role="status">No {league} club has four players with {chartLabel(stat).toLowerCase()} yet</p> : (
          <div className="sc-canvas">
            <ResponsiveCirclePacking<Datum>
              data={tree}
              id="id"
              value="value"
              margin={{ top: 20, right: 8, bottom: 8, left: 8 }}
              padding={5}
              leavesOnly={false}
              zoomedId={zoomed}
              colors={(n) => n.depth === 0 ? "rgba(0,0,0,0)" : n.depth === 1 ? clubFill : `${POS_COLOR[n.data.player!.pos as Position]}${n.data.top ? "" : "8c"}`}
              borderWidth={0}
              enableLabels
              label={(n) => (n.depth === 2 ? (zoomed ? `${n.data.player!.name.split(" ").slice(-1)[0]} ${pct(n.data.share!)}` : pct(n.data.share!)) : "")}
              labelsSkipRadius={zoomed ? 26 : 12}
              labelsFilter={(l) => l.node.depth === 2}
              labelTextColor="#ffffff"
              tooltip={() => <></>}
              onMouseEnter={(n) => setHover(n.depth === 2 ? n : null)}
              onMouseMove={(n) => setHover(n.depth === 2 ? n : null)}
              onClick={(n) => setZoomed(n.depth === 0 || (n.depth === 1 && zoomed === n.id) ? null : n.depth === 1 ? n.id : (n.parent?.id ?? null))}
              layers={["circles", "labels", crests(middle)]}
              theme={{ labels: { text: { fontSize: 11, fontWeight: 700, fontFamily: "inherit" } } }}
              role="img"
              motionConfig="gentle"
            />
            {shown ? (
              <PlayerPop
                player={shown.data.player!}
                width={120}
                lines={[
                  { big: pct(shown.data.share!), label: `of ${shown.data.player!.club}'s ${chartLabel(stat).toLowerCase()}` },
                  { big: chartValue(stat, shown.data.value!), label: "per start", sub: `${shown.data.player!.starts} starts` },
                ]}
                style={{ left: shown.x > middle.current ? shown.x - shown.radius - 380 : shown.x + shown.radius + 14, top: Math.max(0, shown.y - 110) }}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
