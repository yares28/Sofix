"use client";

import { useEffect, useRef } from "react";
import {
  barsOf,
  capsulesOf,
  chainOf,
  dialOf,
  nextRunLabel,
  pulseOf,
  type ChainNode,
  type DialMark,
  type SystemStatus,
} from "../lib/control";
import RefreshButton from "./RefreshButton";

type Props = {
  now: Date;
  syncedAt: string | null;
  system: SystemStatus | null;
  refreshEnabled: boolean;
  onClose: () => void;
};

const ICONS: Record<ChainNode["id"], React.ReactNode> = {
  sorare: (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11 6.5l3.5 2.5-1.3 4h-4.4l-1.3-4Z" fill="currentColor" />
    </svg>
  ),
  extension: (
    <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6 2.5a1.5 1.5 0 0 1 3 0V4h3a1 1 0 0 1 1 1v3h-1.5a1.5 1.5 0 0 0 0 3H13v2a1 1 0 0 1-1 1H9v-1.5a1.5 1.5 0 0 0-3 0V14H4a1 1 0 0 1-1-1v-3h1.5a1.5 1.5 0 0 0 0-3H3V5a1 1 0 0 1 1-1h2Z"
        fill="currentColor"
      />
    </svg>
  ),
  app: (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <clipPath id="cc-app-mark">
        <rect width="32" height="32" rx="8" />
      </clipPath>
      <g clipPath="url(#cc-app-mark)">
        <rect x="0" width="7" height="32" fill="#1f7a4f" />
        <rect x="6.4" width="7" height="32" fill="#5cc58d" />
        <rect x="12.8" width="7" height="32" fill="#e3e3e8" />
        <rect x="19.2" width="7" height="32" fill="#ff7b6e" />
        <rect x="25.6" width="6.4" height="32" fill="#c4312a" />
      </g>
    </svg>
  ),
  jobs: (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11 6v5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
};

function Dial({ marks, nowHour }: { marks: DialMark[]; nowHour: number }) {
  const C = 120;
  const pt = (h: number, r: number): [number, number] => {
    const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  const arc = (h0: number, h1: number, r: number) => {
    const [x0, y0] = pt(h0, r);
    const [x1, y1] = pt(h1, r);
    const large = (h1 - h0 + 24) % 24 > 12 ? 1 : 0;
    return `M${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  const [hx, hy] = pt(nowHour, 58);
  const label = marks.map((m) => `${m.label} ${m.kind === "todo" ? "to come" : m.kind}`).join(", ");
  return (
    <svg viewBox="0 0 240 240" role="img" aria-label={`Today's refreshes: ${label || "none"}`}>
      <circle className="ring" cx={C} cy={C} r="99" />
      <path className="night" d={arc(21, 7, 99)} />
      {Array.from({ length: 24 }, (_, h) => {
        const major = h % 6 === 0;
        const [x0, y0] = pt(h, major ? 80 : 84);
        const [x1, y1] = pt(h, 88);
        return <line key={h} className={`tick${major ? " major" : ""}`} x1={x0} y1={y0} x2={x1} y2={y1} />;
      })}
      {[0, 6, 12, 18].map((h) => {
        const [x, y] = pt(h, 68);
        return (
          <text key={h} className="lbl" x={x} y={y}>
            {String(h).padStart(2, "0")}
          </text>
        );
      })}
      {marks.map((m) => {
        const [x, y] = pt(m.hour, 99);
        return (
          <circle key={m.label} className={`mark ${m.kind}`} cx={x} cy={y} r="6.5">
            <title>{`Board refresh ${m.label}`}</title>
          </circle>
        );
      })}
      <line className="hand" x1={C} y1={C} x2={hx} y2={hy} />
      <circle className="hub" cx={C} cy={C} r="5" />
    </svg>
  );
}

export default function ControlCenter({ now, syncedAt, system, refreshEnabled, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const runs = system?.runs ?? [];
  const pulse = pulseOf(system, syncedAt, now);
  const { marks, nowHour } = dialOf(runs, now);
  const bars = barsOf(runs);
  const max = Math.max(1, ...bars.map((b) => b.seconds ?? 0));
  const caps = capsulesOf(system?.limits ?? null);
  const chain = chainOf(system, now);
  const next = nextRunLabel(now);
  const scheduled = runs.filter((run) => run.trigger === "schedule").length;
  const failedRuns = runs.filter((run) => run.status === "failed").length;

  return (
    <div className="cc-scrim">
      <button type="button" className="cc-backdrop" aria-label="Close Control Center" tabIndex={-1} onClick={onClose} />
      <div className="cc-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-title">
        <header className="cc-head">
          <h2 id="cc-title">Control Center</h2>
          <button ref={closeRef} type="button" className="cc-x" onClick={onClose} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="cc-grid">
          <section className={`cc-w cc-pulse ${pulse.state}`} style={{ "--i": 0 } as React.CSSProperties} aria-labelledby="cc-pulse-title">
            <div>
              <span className="cc-orb" aria-hidden="true">
                {pulse.state === "good" ? (
                  <svg width="26" height="26" viewBox="0 0 26 26">
                    <path d="m7 13.5 4 4L19.5 9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="26" height="26" viewBox="0 0 26 26">
                    <path d="M13 7v8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                    <circle cx="13" cy="19.5" r="1.7" fill="currentColor" />
                  </svg>
                )}
              </span>
              <h4 id="cc-pulse-title">{pulse.title}</h4>
              <p>{pulse.detail}</p>
              <svg className="cc-ecg" viewBox="0 0 320 56" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 30h70l8-16 10 34 9-26 6 8h60l7-12 9 22 8-10h40l6-6 8 12h79" />
              </svg>
            </div>
            {refreshEnabled ? <RefreshButton /> : <span className="cc-note">Refreshes run by themselves on a clock.</span>}
          </section>

          <section className="cc-w cc-dial" style={{ "--i": 1 } as React.CSSProperties} aria-label="Today's schedule">
            <Dial marks={marks} nowHour={nowHour} />
            <div className="cc-dial-cap">
              <b>{next ? `Next · ${next}` : "No refresh scheduled"}</b>
              <span>board refresh, Madrid time</span>
            </div>
            <div className="cc-legend">
              <span>
                <i style={{ background: "var(--good)" }} />
                done
              </span>
              <span>
                <i style={{ background: "#fff", boxShadow: "inset 0 0 0 2px var(--good)" }} />
                to come
              </span>
              <span>
                <i style={{ background: "#fff", boxShadow: "inset 0 0 0 2px var(--low)" }} />
                missed
              </span>
            </div>
          </section>

          <section className="cc-w cc-runs" style={{ "--i": 2 } as React.CSSProperties}>
            <h3>
              Last refreshes <span className="end">{failedRuns ? `${failedRuns} failed` : bars.length ? "all ✓" : ""}</span>
            </h3>
            <div className="cc-bars">
              {bars.map((bar, i) => (
                <div
                  key={bar.id}
                  className={`cc-bar${bar.status === "failed" ? " failed" : ""}`}
                  style={{ "--i": i } as React.CSSProperties}
                  title={`${bar.trigger === "schedule" ? "On schedule" : bar.trigger === "button" ? "Refresh button" : "By hand"} · ${bar.day} ${bar.time}${bar.seconds != null ? ` · ${bar.seconds} s` : ""}`}
                >
                  <em>{bar.seconds != null ? `${bar.seconds}s` : "…"}</em>
                  <i style={{ height: `${Math.max(6, ((bar.seconds ?? 0) / max) * 100)}%` }} />
                  <span>{bar.day}</span>
                </div>
              ))}
              {next && (
                <div className="cc-bar next" style={{ "--i": bars.length } as React.CSSProperties} title={`Next scheduled refresh ${next}`}>
                  <em>next</em>
                  <i style={{ height: "45%" }} />
                  <span>{next.replace("tomorrow ", "")}</span>
                </div>
              )}
            </div>
            <div className="cap">
              <b>
                {scheduled} of {runs.length}
              </b>{" "}
              on schedule
            </div>
          </section>

          <section className="cc-w cc-chain" style={{ "--i": 3 } as React.CSSProperties}>
            <h3>
              Connections <span className="end">{chain.every((n) => n.on) ? "all linked" : `${chain.filter((n) => !n.on).length} to go`}</span>
            </h3>
            <div className="cc-links">
              {chain.map((node, i) => (
                <FragmentNode key={node.id} node={node} last={i === chain.length - 1} next={chain[i + 1]} index={i} />
              ))}
            </div>
          </section>

          <section className="cc-w cc-limits" style={{ "--i": 4 } as React.CSSProperties}>
            <h3>
              Free limits <span className="end">left</span>
            </h3>
            <div className="cc-caps">
              {caps.map((cap) => (
                <div key={cap.name} className="cc-cap">
                  <div className="cc-tube" role="img" aria-label={`${cap.name}: ${cap.value} ${cap.sub}`}>
                    <i style={{ height: `${Math.round(cap.fraction * 100)}%` }} />
                    <b>{cap.value}</b>
                  </div>
                  <strong>{cap.name}</strong>
                  <span>{cap.sub}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function FragmentNode({ node, last, next, index }: { node: ChainNode; last: boolean; next?: ChainNode; index: number }) {
  // The last node (cloud jobs) and the wire before it are hidden on phones to keep the chain on one line.
  const hide = index >= 3 ? " hide-sm" : "";
  return (
    <>
      <div className={`cc-node${node.on ? "" : " off"}${hide}`}>
        <span className="ic">{ICONS[node.id]}</span>
        <b>{node.label}</b>
        <span>{node.sub}</span>
      </div>
      {!last && <div className={`cc-wire${node.on && next?.on ? "" : " off"}${index >= 2 ? " hide-sm" : ""}`} />}
    </>
  );
}
