"use client";

import { useRouter } from "next/navigation";
import type { Sorare } from "../lib/play";
import SorarePanel from "./control/SorarePanel";
import { useEffect, useRef, useState } from "react";
import {
  barsOf,
  capsulesOf,
  chainOf,
  dialOf,
  nextRunLabel,
  pulseOf,
  setupLeft,
  withLiveExtension,
  type ChainNode,
  type DialMark,
  type PulseState,
  type SystemStatus,
} from "../lib/control";
import { pingExtension, type ExtensionPing } from "../lib/extension";
import type { QrCode } from "../lib/qr";
import ExtensionSetup, { type ExtensionStage } from "./control/ExtensionSetup";
import GetTheApp from "./control/GetTheApp";
import HowItRuns from "./control/HowItRuns";
import RefreshSetup from "./control/RefreshSetup";
import RefreshButton from "./RefreshButton";

export type ControlCenterProps = {
  /** The server's clock at render, so the first paint matches hydration; the browser's clock takes over after. */
  serverNow: string;
  syncedAt: string | null;
  system: SystemStatus | null;
  /** The Sorare gameweek, when the job has published one: the panel says whether it is still worth acting on. */
  sorare: Sorare | null;
  refreshEnabled: boolean;
  app: { host: string; qr: QrCode };
  extensionDir: string | null;
  links: { githubToken: string; vercelEnv: string };
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

const CHECK = (
  <svg width="26" height="26" viewBox="0 0 26 26">
    <path d="m7 13.5 4 4L19.5 9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const BANG = (
  <svg width="26" height="26" viewBox="0 0 26 26">
    <path d="M13 7v8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
    <circle cx="13" cy="19.5" r="1.7" fill="currentColor" />
  </svg>
);
const PAUSE = (
  <svg width="26" height="26" viewBox="0 0 26 26">
    <path d="M10 8v10M16 8v10" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);
const ORB: Record<PulseState, React.ReactNode> = { good: CHECK, setup: BANG, stale: BANG, failed: BANG, paused: PAUSE };

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

function ChainLink({ node, next, index }: { node: ChainNode; next?: ChainNode; index: number }) {
  // The last node (cloud jobs) and the wire before it are hidden on phones to keep the chain on one line.
  return (
    <>
      <div className={`cc-node${node.on ? "" : " off"}${index >= 3 ? " hide-sm" : ""}`}>
        <span className="ic">{ICONS[node.id]}</span>
        <b>{node.label}</b>
        <span>{node.sub}</span>
      </div>
      {next && <div className={`cc-wire${node.on && next.on ? "" : " off"}${index >= 2 ? " hide-sm" : ""}`} />}
    </>
  );
}

/**
 * The Control Center page: status, today's schedule, the last refreshes, the connection chain and the free limits,
 * then whatever setup is left, installing the app, and how it all runs. Design: docs/sorare/design/S1-foundation.html.
 */
export default function ControlCenter({ serverNow, syncedAt, system: stored, sorare, refreshEnabled, app, extensionDir, links }: ControlCenterProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(serverNow));
  const [live, setLive] = useState<ExtensionPing | null>(null);
  // Setup still open when the page loaded: linking it now shows the "done" card instead of making it vanish.
  const [setupAtLoad] = useState(() => setupLeft(stored));
  const refreshedFor = useRef<string | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Ask the extension directly (free, local), and again whenever the tab comes back to the front: that is when the
  // owner returns from chrome://extensions or sorare.com.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const ping = await pingExtension();
      if (!cancelled && ping) setLive(ping);
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // The extension's check-in revalidates the cached status; reload the server data once so the nav pill agrees.
  useEffect(() => {
    if (!live) return;
    const said = `${live.version}:${live.sorareUser ?? ""}`;
    const known = stored?.extension ? `${stored.extension.version}:${stored.extension.sorareUser ?? ""}` : null;
    if (said === known || refreshedFor.current === said) return;
    refreshedFor.current = said;
    const timer = window.setTimeout(() => router.refresh(), 1500);
    return () => window.clearTimeout(timer);
  }, [live, stored, router]);

  const system = withLiveExtension(stored, live, now);
  const pulse = pulseOf(system, syncedAt, now);
  const runs = system?.runs ?? [];
  const { marks, nowHour } = dialOf(runs, now);
  const bars = barsOf(runs);
  const longest = Math.max(1, ...bars.map((bar) => bar.seconds ?? 0));
  const caps = capsulesOf(system?.limits ?? null);
  const chain = chainOf(system, now);
  const next = nextRunLabel(now);
  const scheduled = bars.filter((bar) => bar.trigger === "schedule").length;
  const failed = bars.filter((bar) => bar.status === "failed").length;
  const missing = chain.filter((node) => !node.on).length;

  const extension = system?.extension ?? null;
  const stage: ExtensionStage = !setupLeft(system) ? "done" : extension ? "sign-in" : "add";
  const showExtension = stage !== "done" || setupAtLoad;
  const linked = chain.find((node) => node.id === "sorare")?.on ?? false;
  const setupNote = showExtension && stage !== "done" ? "1 step left" : refreshEnabled ? "done" : "optional";
  const bytes = system?.limits?.databaseBytes;
  const databaseLabel = bytes != null ? `${(bytes / 1_048_576).toFixed(1)} MB` : "your data";

  return (
    <>
      <header className="cc-top">
        <h1>Control Center</h1>
        <p>Status, schedule and setup</p>
      </header>

      <div className="cc-grid">
        <section className={`cc-w cc-pulse ${pulse.state}`} style={{ "--i": 0 } as React.CSSProperties} aria-labelledby="cc-pulse-title">
          <div>
            <span className="cc-orb" aria-hidden="true">
              {ORB[pulse.state]}
            </span>
            <h2 id="cc-pulse-title">{pulse.title}</h2>
            <p>{pulse.detail}</p>
            <svg className="cc-ecg" viewBox="0 0 320 56" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 30h70l8-16 10 34 9-26 6 8h60l7-12 9 22 8-10h40l6-6 8 12h79" />
            </svg>
          </div>
          <div className="cc-go">
            {refreshEnabled && <RefreshButton />}
            {pulse.state === "setup" &&
              (stage === "sign-in" ? (
                <a className={`cc-btn ${refreshEnabled ? "soft" : "primary"}`} href="https://sorare.com/" target="_blank" rel="noreferrer">
                  Open sorare.com
                </a>
              ) : (
                <a className={`cc-btn ${refreshEnabled ? "soft" : "primary"}`} href="#extension">
                  Add extension
                </a>
              ))}
            {!refreshEnabled && pulse.state !== "setup" && (
              <span className="cc-note">
                Refreshes run by themselves on a clock · <a href="#refresh-button">add a button</a>
              </span>
            )}
          </div>
        </section>

        <section className="cc-w cc-dial" style={{ "--i": 1 } as React.CSSProperties} aria-label="Today's schedule">
          <Dial marks={marks} nowHour={nowHour} />
          <div className="cc-dial-cap">
            <b>{next ? `Next · ${next}` : "No refresh scheduled"}</b>
            <span>board refresh, Madrid time</span>
          </div>
          <div className="cc-legend">
            <span>
              <i className="done" />
              done
            </span>
            <span>
              <i className="todo" />
              to come
            </span>
            <span>
              <i className="missed" />
              missed
            </span>
          </div>
        </section>

        <section className="cc-w cc-runs" style={{ "--i": 2 } as React.CSSProperties} aria-labelledby="cc-runs-title">
          <h2 className="cc-label" id="cc-runs-title">
            Last refreshes <span className="end">{failed ? `${failed} failed` : bars.length ? "all ✓" : ""}</span>
          </h2>
          <div className="cc-bars">
            {bars.map((bar, i) => (
              <div
                key={bar.id}
                className={`cc-bar${bar.status === "failed" ? " failed" : ""}`}
                style={{ "--i": i } as React.CSSProperties}
                title={`${bar.trigger === "schedule" ? "On schedule" : bar.trigger === "button" ? "Refresh button" : "By hand"} · ${bar.when}${bar.seconds != null ? ` · ${bar.seconds} s` : ""}`}
              >
                <em>{bar.seconds != null ? `${bar.seconds}s` : "…"}</em>
                <i style={{ height: `${Math.max(6, ((bar.seconds ?? 0) / longest) * 100)}%` }} />
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
              {scheduled} of {bars.length}
            </b>{" "}
            on schedule
          </div>
        </section>

        <section className="cc-w cc-chain" style={{ "--i": 3 } as React.CSSProperties} aria-labelledby="cc-chain-title">
          <h2 className="cc-label" id="cc-chain-title">
            Connections <span className="end">{missing ? `${missing} to go` : "all linked"}</span>
          </h2>
          <div className="cc-links">
            {chain.map((node, i) => (
              <ChainLink key={node.id} node={node} next={chain[i + 1]} index={i} />
            ))}
          </div>
        </section>

        <section className="cc-w cc-limits" style={{ "--i": 4 } as React.CSSProperties} aria-labelledby="cc-limits-title">
          <h2 className="cc-label" id="cc-limits-title">
            Free limits <span className="end">left</span>
          </h2>
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

        {sorare ? <SorarePanel data={sorare} now={now} /> : null}
      </div>

      {(showExtension || !refreshEnabled) && (
        <>
          <div className="cc-sec">
            <h2>Setup</h2>
            <span>{setupNote}</span>
          </div>
          <div className="cc-stack">
            {showExtension && <ExtensionSetup stage={stage} user={extension?.sorareUser ?? null} version={extension?.version ?? null} extensionDir={extensionDir} />}
            {!refreshEnabled && <RefreshSetup tokenUrl={links.githubToken} vercelUrl={links.vercelEnv} />}
          </div>
        </>
      )}

      <div className="cc-app-only">
        <div className="cc-sec">
          <h2>Get the app</h2>
          <span>desktop and phone, same login</span>
        </div>
        <GetTheApp host={app.host} qr={app.qr} />
      </div>

      <div className="cc-sec">
        <h2>How it runs</h2>
        <span>nothing to start</span>
      </div>
      <HowItRuns linked={linked} databaseLabel={databaseLabel} />
    </>
  );
}
