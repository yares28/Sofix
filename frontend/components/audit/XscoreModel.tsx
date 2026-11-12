import replay from "../../lib/data/sofix_v1_replay.json";
import { percent, type XscoreModels } from "../../lib/audit";

const roles = [["start", "Starters"], ["bench", "Played substitutes"]] as const;
const latest = replay.phases.at(-1)!;
const count = (n: number) => n.toLocaleString("en-GB");
const rate = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

export default function XscoreModel({ live }: { live?: XscoreModels }) {
  return (
    <section className="au-w lg-card" aria-labelledby="sofix-model">
      <h2 id="sofix-model">Sofix v1 · LaLiga xScore</h2>
      <p className="lg-cap">Within 7 points of the actual score. Replay figures show the previous model → Sofix v1.</p>
      <div className="ax-grid">
        {roles.map(([role, title]) => {
          const past = latest[role];
          const saved = live?.["Sofix v1"]?.[role];
          return (
            <div className="ax-6" key={role}>
              <h3>{title}</h3>
              <dl className="lg-stats">
                <div>
                  <dt>Jan–Oct 2026 replay · {count(past.cases)} appearances</dt>
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
