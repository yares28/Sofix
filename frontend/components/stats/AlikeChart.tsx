"use client";

import { ResponsiveNetwork, type LinkProps, type NodeProps } from "@nivo/network";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { chartLabel, LEAGUES, likeness, lookAlikes, type ChartPlayer, type ChartWindow, type LookAlike } from "../../lib/statCharts";
import { PlayerPop, POS_COLOR, useNarrow, useSize } from "./chartParts";

// Each card is placed by us, not by the force layout (which starts every node on one point and piles the closest ones up):
// on a ring round the hub, nearer when more alike, so the picture reads at a glance. nivo still draws every node and link.
type Node = { id: string; player: ChartPlayer; hub: boolean; like: number; w: number; h: number; px: number; py: number };
type Link = { source: string; target: string; hub: boolean };
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const CARD = { hub: [92, 149], node: [54, 87] } as const;
const SMALL = { hub: [60, 97], node: [38, 62] } as const;
const PEER = 0.86; // two look-alikes this alike are joined too
const MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };

/** Where each look-alike sits: evenly round the hub, the closest on the inner ring. */
export function ringLayout(count: number, likes: number[], width: number, height: number, card: readonly [number, number], hubCard: readonly [number, number]) {
  const cx = width / 2;
  const cy = height / 2 + 6;
  // an ellipse that fills the box: the outer ring touches its edges, the inner one clears the hub's card
  const outer = { x: Math.max(40, Math.min(cx - card[0] / 2 - 8, 460)), y: Math.max(40, cy - card[1] / 2 - 26) };
  const inner = { x: Math.min(outer.x, Math.max(hubCard[0] / 2 + card[0] / 2 + 20, outer.x * 0.5)), y: Math.min(outer.y, Math.max(hubCard[1] / 2 + card[1] / 2 + 8, outer.y * 0.55)) };
  const hi = Math.max(...likes);
  const lo = Math.min(...likes);
  return likes.map((like, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, count);
    const t = (hi - like) / Math.max(1e-6, hi - lo);
    return { x: cx + Math.cos(angle) * (inner.x + t * (outer.x - inner.x)), y: cy + Math.sin(angle) * (inner.y + t * (outer.y - inner.y)) };
  });
}

function nodeCard(open: { current: (slug: string) => void }) {
  return function NodeCard({ node, onClick, onMouseEnter, onMouseLeave }: NodeProps<Node>) {
    const { w, h, px, py, hub, player, like } = node.data;
    const clip = `sc-clip-${node.id}`;
    return (
      <g
        transform={`translate(${px},${py})`}
        className={`sc-node${hub ? " hub" : ""}`}
        tabIndex={hub ? -1 : 0}
        role={hub ? undefined : "button"}
        aria-label={hub ? undefined : `${player.name}, ${Math.round(like * 100)}% alike. Show his look-alikes`}
        onClick={(e) => onClick?.(node, e)}
        onMouseEnter={(e) => onMouseEnter?.(node, e)}
        onMouseLeave={(e) => onMouseLeave?.(node, e)}
        onFocus={(e) => onMouseEnter?.(node, e as never)}
        onBlur={(e) => onMouseLeave?.(node, e as never)}
        onKeyDown={(e: KeyboardEvent) => { if (!hub && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open.current(node.id); } }}
      >
        <clipPath id={clip}><rect x={-w / 2} y={-h / 2} width={w} height={h} rx={hub ? 9 : 6} /></clipPath>
        <rect x={-w / 2 - 2} y={-h / 2 - 2} width={w + 4} height={h + 4} rx={hub ? 11 : 8} className="sc-node-ring" style={{ fill: hub ? POS_COLOR[player.pos] : player.mine ? "var(--ink)" : "var(--surface)" }} />
        {player.card ? <image href={player.card} x={-w / 2} y={-h / 2} width={w} height={h} clipPath={`url(#${clip})`} preserveAspectRatio="xMidYMid slice" /> : <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={6} className="sc-node-blank" />}
        {hub ? null : (
          <g transform={`translate(0,${h / 2 + 13})`}>
            <rect x={-21} y={-10} width={42} height={20} rx={10} className="sc-node-pill" />
            <text textAnchor="middle" dy="4" className="sc-node-pct">{Math.round(like * 100)}%</text>
          </g>
        )}
      </g>
    );
  };
}

/** Links drawn between our positions; the one to the card under the pointer is darker. */
function LinkLine({ link }: LinkProps<Node, Link>) {
  const { source, target } = link;
  return <line x1={source.data.px} y1={source.data.py} x2={target.data.px} y2={target.data.py} className={link.data.hub ? "sc-link" : "sc-link sc-peer"} data-to={target.id} />;
}

/** Plays like him: pick any player and his twelve closest look-alikes gather round, nearer when more alike. */
export default function AlikeChart({ data }: { data: ChartWindow }) {
  const narrow = useNarrow();
  const [box, size] = useSize<HTMLDivElement>();
  const start = useMemo(() => [...data.players].sort((a, b) => b.avg - a.avg)[0]?.slug ?? "", [data]);
  const [trail, setTrail] = useState<string[]>([]);
  const [scope, setScope] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const open = useRef<(slug: string) => void>(() => {});
  const NodeCard = useMemo(() => nodeCard(open), []);
  const hubSlug = trail[trail.length - 1] ?? start;
  const hub = data.players.find((p) => p.slug === hubSlug) ?? data.players.find((p) => p.slug === start);
  const near = useMemo<LookAlike[]>(() => (hub ? lookAlikes(data, hub, scope) : []), [data, hub, scope]);
  const graph = useMemo(() => {
    if (!hub || !size.width) return { nodes: [] as Node[], links: [] as Link[] };
    const cards = narrow ? SMALL : CARD;
    const spots = ringLayout(near.length, near.map((n) => n.like), size.width, size.height, cards.node, cards.hub);
    const nodes: Node[] = [
      { id: hub.slug, player: hub, hub: true, like: 1, w: cards.hub[0], h: cards.hub[1], px: size.width / 2, py: size.height / 2 + 6 },
      ...near.map((n, i) => ({ id: n.player.slug, player: n.player, hub: false, like: n.like, w: cards.node[0], h: cards.node[1], px: spots[i]!.x, py: spots[i]!.y })),
    ];
    const links: Link[] = near.map((n) => ({ source: hub.slug, target: n.player.slug, hub: true }));
    near.forEach((a, i) => near.slice(i + 1).forEach((b) => {
      if (likeness(a.profile, b.profile) > PEER) links.push({ source: a.player.slug, target: b.player.slug, hub: false });
    }));
    return { nodes, links };
  }, [hub, near, narrow, size.width, size.height]);
  const go = (slug: string) => { setTrail((t) => [...t, slug].slice(-12)); setHoverId(null); setQ(""); };
  open.current = go;
  const needle = fold(q.trim());
  const hits = needle.length >= 2 ? data.players.filter((p) => fold(p.name).includes(needle)).slice(0, 6) : [];
  const hovered = near.find((n) => n.player.slug === hoverId);
  const spot = graph.nodes.find((n) => n.id === hoverId);

  if (!hub) return <p className="sc-empty" role="status">Nobody with enough starts in this window yet</p>;
  return (
    <div className="sc-alike">
      <div className="sc-filters">
        <div className="sc-find-inline">
          <label className="sc-search">
            <span className="visually-hidden">Find a player</span>
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <input type="search" name="alike-player" autoComplete="off" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find any player…" />
          </label>
          {hits.length ? (
            <ul className="sc-menu-list sc-hits-pop">
              {hits.map((p) => <li key={p.slug}><button type="button" onClick={() => go(p.slug)}>{p.name}<span className="sc-n">{p.pos} · {p.club}</span></button></li>)}
            </ul>
          ) : null}
        </div>
        <select className="sc-select" aria-label="Look-alikes from" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="ALL">From every league</option>
          {LEAGUES.map((l) => <option key={l} value={l}>From {l}</option>)}
        </select>
        {trail.length ? (
          <button type="button" className="sc-back" onClick={() => setTrail((t) => t.slice(0, -1))}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M8 2L4 6l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            {data.players.find((p) => p.slug === (trail[trail.length - 2] ?? start))?.name ?? "Back"}
          </button>
        ) : null}
      </div>
      <div className="sc-plot sc-plot-net" data-hot={hoverId ?? undefined}>
        <p className="sc-hub-name">{hub.name}<span>{hub.pos} · {hub.club}</span></p>
        {near.length ? (
          <div className="sc-canvas" ref={box}>
            {graph.nodes.length ? (
              <ResponsiveNetwork<Node, Link>
                data={graph}
                margin={MARGIN}
                iterations={1}
                nodeComponent={NodeCard}
                linkComponent={LinkLine}
                onClick={(n) => { if (!n.data.hub) go(n.id); }}
                onMouseEnter={(n) => setHoverId(n.data.hub ? null : n.id)}
                onMouseLeave={() => setHoverId(null)}
                isInteractive
                nodeTooltip={() => null}
                role="img"
                ariaLabel={`The ${near.length} players who play most like ${hub.name}`}
                animate={false}
              />
            ) : null}
            {hovered && spot ? (
              <PlayerPop
                player={hovered.player}
                width={120}
                lines={[
                  { big: `${Math.round(hovered.like * 100)}%`, label: `alike ${hub.name}` },
                  { big: "", label: `Same: ${hovered.same.map((k) => chartLabel(k).toLowerCase()).join(", ")}` },
                  { big: "", label: `${hovered.apart.more ? "More" : "Fewer"} ${chartLabel(hovered.apart.key).toLowerCase()} than ${hub.name}` },
                ]}
                style={{ left: spot.px > size.width / 2 ? spot.px - spot.w / 2 - 412 : spot.px + spot.w / 2 + 12, top: Math.max(0, Math.min(size.height - 230, spot.py - 110)) }}
              />
            ) : null}
          </div>
        ) : <p className="sc-empty" role="status">No {hub.pos} {scope === "ALL" ? "" : `in ${scope} `}to compare with yet</p>}
      </div>
    </div>
  );
}
