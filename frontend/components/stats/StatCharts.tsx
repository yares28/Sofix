"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { WINDOWS, type ChartWindow, type WindowKey } from "../../lib/statCharts";
import { useChartWindow } from "./chartParts";

const Skeleton = () => <div className="sc-plot sc-sk" aria-hidden="true" />;
// Each chart's code (nivo and the chart) loads when its tab is first opened, not with the page.
const Scatter = dynamic(() => import("./ScatterChart"), { ssr: false, loading: Skeleton });
const Clubs = dynamic(() => import("./ClubsChart"), { ssr: false, loading: Skeleton });
const FaceOff = dynamic(() => import("./FaceOffChart"), { ssr: false, loading: Skeleton });
const Alike = dynamic(() => import("./AlikeChart"), { ssr: false, loading: Skeleton });

const VIEWS = [
  { key: "scatter", tab: "Scatter", title: "Who sticks out", Chart: Scatter },
  { key: "clubs", tab: "Clubs", title: "Who carries the club", Chart: Clubs },
  { key: "faceoff", tab: "Face-off", title: "Face-off", Chart: FaceOff },
  { key: "alike", tab: "Look-alikes", title: "Plays like him", Chart: Alike },
] as const;
type View = (typeof VIEWS)[number]["key"];

/**
 * The Stats page's charts (owner's ask, 26 Oct 2026): four ways to see which players stand out, every player of the five big
 * leagues with five starts, over this season or his last 5, 10 or 40 starts. Players are drawn as their real Sorare card.
 */
export default function StatCharts({ initial }: { initial: { chart?: string; window?: string } }) {
  const [view, setViewState] = useState<View>(VIEWS.find((v) => v.key === initial.chart)?.key ?? "scatter");
  const [window, setWindowState] = useState<WindowKey>(WINDOWS.find((w) => w.key === initial.window)?.key ?? "cur");
  // the address keeps the chart and the window (?chart=&cw=), without asking the server for the page again
  const remember = (key: string, value: string) => {
    const url = new URL(globalThis.location.href);
    url.searchParams.set(key, value);
    globalThis.history.replaceState(globalThis.history.state, "", url);
  };
  const setView = (next: View) => { setViewState(next); remember("chart", next); };
  const setWindow = (next: WindowKey) => { setWindowState(next); remember("cw", next); };
  const { data, loading, failed } = useChartWindow(window);
  const current = VIEWS.find((v) => v.key === view)!;
  const Chart = current.Chart as React.ComponentType<{ data: ChartWindow }>;

  return (
    <section className="sc" aria-labelledby="sc-title">
      <header className="sc-head">
        <h2 id="sc-title">{current.title}</h2>
        <div className="sc-seg sc-tabs" role="tablist" aria-label="Chart">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" role="tab" id={`sc-tab-${v.key}`} aria-selected={view === v.key} aria-controls="sc-panel" onClick={() => setView(v.key)}>{v.tab}</button>
          ))}
        </div>
        <div className="sc-seg" role="group" aria-label="Time">
          {WINDOWS.map((w) => <button key={w.key} type="button" aria-pressed={window === w.key} onClick={() => setWindow(w.key)}>{w.label}</button>)}
        </div>
      </header>
      <div id="sc-panel" role="tabpanel" aria-labelledby={`sc-tab-${view}`} className={`sc-panel${loading && data ? " sc-loading" : ""}`} aria-busy={loading}>
        {failed && !data ? <p className="sc-plot sc-empty" role="status">The charts could not be read just now</p>
          : !data ? <Skeleton />
          : !data.players.length ? <p className="sc-plot sc-empty" role="status">{window === "cur" ? "Nobody has three starts this season yet" : "The charts appear after the next league-history run"}</p>
          : <Chart key={view} data={data} />}
      </div>
    </section>
  );
}
