"use client";

import { useState } from "react";
import laliga from "../../lib/data/sofix_v1_replay.json";
import others from "../../lib/data/sofix_v1_competitions_replay.json";
import { percent, type XscoreModels } from "../../lib/audit";
import { COMPETITIONS } from "../../lib/competitions";
import { CompetitionIcon } from "../CompetitionPicker";

const roles = [["start", "Starters"], ["bench", "Played substitutes"]] as const;
type Replay = { cases: number; previousHits: number; hits: number; gained: number; spoiled: number; previousMAE: number; mae: number };
type Model = { name: string; version: string; period: string; replay: Record<"start" | "bench", Replay> };
const latest = laliga.phases.at(-1)!;
// LaLiga's release replay, then each other competition's 2025/26 replay, fitted on 2023/24-2024/25 only
const models: Record<string, Model> = {
  PD: { name: COMPETITIONS.PD, version: "Sofix v1", period: "Jan–Oct 2026 replay", replay: latest },
  ...Object.fromEntries(Object.entries(others.competitions).map(([code, model]) => [code, {
    name: COMPETITIONS[code as keyof typeof COMPETITIONS], version: `Sofix v1 ${code}`, period: `${model.period} replay`, replay: model,
  }])),
};
const count = (n: number) => n.toLocaleString("en-GB");
const rate = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

export default function XscoreModel({ live }: { live?: XscoreModels }) {
  const [code, setCode] = useState("PD");
  const model = models[code] ?? models.PD!;
  return (
    <section className="au-w lg-card ax-model" aria-labelledby="sofix-model">
      <div className="ax-model-head">
        <div>
          <h2 id="sofix-model">Sofix v1 · {model.name} xScore</h2>
          <p className="lg-cap">Within 7 points of the actual score. Replay figures show the previous model → Sofix v1.</p>
        </div>
        <div className="competition-icons" role="group" aria-label="Competition">
          {Object.entries(models).map(([key, { name }]) => <button key={key} type="button" title={name} aria-label={name}
            aria-pressed={key === code} onClick={() => setCode(key)}><CompetitionIcon competition={key as keyof typeof COMPETITIONS} /></button>)}
        </div>
      </div>
      <div className="ax-grid" key={code}>
        {roles.map(([role, title]) => {
          const past = model.replay[role];
          const saved = live?.[model.version]?.[role];
          return (
            <div className="ax-6" key={role}>
              <h3>{title}</h3>
              <dl className="lg-stats">
                <div>
                  <dt>{model.period} · {count(past.cases)} appearances</dt>
                  <dd>{rate.format(past.previousHits / past.cases)} → {rate.format(past.hits / past.cases)}</dd>
                </div>
                <div><dt>Hits gained / lost</dt><dd>{count(past.gained)} / {count(past.spoiled)}</dd></div>
                <div><dt>Average miss</dt><dd>{past.previousMAE.toFixed(1)} → {past.mae.toFixed(1)} pts</dd></div>
                <div>
                  <dt>Live forecasts saved before lock</dt>
                  <dd>{saved?.cases ? `${saved.cases < 100 ? "Too few to tell" : percent(saved.hits / saved.cases)} · ${count(saved.cases)} checked` : "Awaiting results"}</dd>
                </div>
                {saved?.paired ? <div><dt>Live hits gained / lost · {count(saved.paired)} compared</dt><dd>{count(saved.gained)} / {count(saved.spoiled)}</dd></div> : null}
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}
