import type { MissionForm } from "../../lib/playerSheet";
import { ACTION_LABELS } from "../../lib/playerSheet";
import { formValues, missionMetric, missionThreshold } from "../../lib/missionForm";
import type { Rule } from "../../lib/missions";

const WINDOWS = [["l5", "Last 5"], ["l10", "Last 10"], ["season", "Season"], ["starts", "Starts"], ["subs", "Subs"]] as const;
const LABELS: Record<string, string> = { ...ACTION_LABELS, decisive: "Decisive games", score: "Sorare score", minutes: "Minutes", mins_played: "Minutes (stat)", clean_sheet_60: "Clean sheets (60+ min)" };
export default function MissionFormEvidence({ form, rule, target, all = false }: { form?: MissionForm; rule: Rule; target?: number; all?: boolean }) {
  if (!form) return <p className="ms-form-note">Dated appearance form not saved.</p>;
  const metric = missionMetric(rule), threshold = missionThreshold(rule, target);
  const value = (key: string, window: typeof WINDOWS[number][0]) => {
    const w = form.windows[window], n = w.samples[key] ?? 0, mean = w.means[key];
    return mean === undefined || !n ? <>&mdash;</> : <>{key === "decisive" ? `${Math.round(100 * mean)}%` : mean.toFixed(1)} <small>n={n}</small></>;
  };
  const hits = (n: number) => {
    const vs = metric ? formValues(form, metric, n) : [];
    return threshold !== undefined && vs.length ? `${vs.filter((v) => v >= threshold).length}/${vs.length}` : "—";
  };
  const keys = [...new Set(Object.values(form.windows).flatMap((w) => Object.keys(w.means)))].sort();
  return <div className="ms-form-evidence">
    {metric ? <><b>{LABELS[metric] ?? metric.replaceAll("_", " ")}</b><dl className="ms-form">{WINDOWS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{value(metric, key)}</dd></div>)}</dl>
      <p className="ms-form-note">Target hits L5 {hits(5)} · L10 {hits(10)}</p></> : null}
    {all ? <details><summary>All recorded stats</summary><table className="ms-form-table"><caption>Average per appearance · {form.season}; starts/subs from this season</caption><thead><tr><th scope="col">Stat</th>{WINDOWS.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead><tbody>{keys.map((key) => <tr key={key}><th scope="row">{LABELS[key] ?? key.replaceAll("_", " ")}</th>{WINDOWS.map(([w]) => <td key={w}>{value(key, w)}</td>)}</tr>)}</tbody></table></details> : null}
    <p className="ms-form-note">Before {new Date(form.before).toLocaleDateString("en-GB", { timeZone: "UTC" })} · {form.season}{all ? ` · ${form.dnp} DNP · ${form.missing} appearances missing stats` : ""}</p>
  </div>;
}
