import { coverage, DATASETS, DATASET_NAME, latestCoverage, type DataHealth } from "../../lib/dataHealth";
import { freshLabel } from "../../lib/fresh";

export default function SavedData({ data, now }: { data: DataHealth | null; now: Date }) {
  return (
    <section className="cc-w cc-data" aria-labelledby="cc-data-h">
      <h2 className="cc-label" id="cc-data-h">Saved data</h2>
      <p className="cc-data-at">{data ? `Checked ${freshLabel(data.generatedAt, now)}. Saved readings stay available when a source stops.` : "Not checked yet. The next refresh will publish coverage."}</p>
      <dl>
        {DATASETS.map((id) => {
          const row = data?.datasets.find((r) => r.id === id);
          return <div key={id}>
            <dt>{DATASET_NAME[id]}</dt>
            <dd>{row ? <>
              <span className="cc-data-count">{coverage(row)}</span>
              <span>{latestCoverage(row)}{row.lastRead ? ` · ${id === "forecasts" || id === "weeks" ? "saved" : "last read"} ${freshLabel(row.lastRead, now)}` : ""}</span>
              {row.warnings.map((warning) => <strong className="cc-data-warning" key={warning}>{warning}</strong>)}
            </> : "Not checked yet"}</dd>
          </div>;
        })}
      </dl>
    </section>
  );
}
