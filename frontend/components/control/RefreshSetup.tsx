/**
 * Shown while the app has no GitHub key: refreshes still run on the schedule, the key only adds the button.
 * GitHub's form comes pre-filled (lib/github.ts githubTokenUrl); the repository is the one thing it can't preselect.
 */
export default function RefreshSetup({ tokenUrl, vercelUrl }: { tokenUrl: string; vercelUrl: string }) {
  return (
    <section className="cc-card cc-refresh" id="refresh-button" aria-labelledby="cc-refresh-title">
      <div>
        <p className="cc-eyebrow">Optional</p>
        <h3 id="cc-refresh-title">A Refresh button</h3>
        <p className="cc-lede">Refreshes already run on a clock. The button needs a GitHub key that can only start them.</p>
      </div>
      <ol className="cc-steps">
        <li className="cc-step">
          <span className="n" aria-hidden="true">
            1
          </span>
          <div>
            <b>Create the key</b>
            <span>Repository access: only select Sofix</span>
          </div>
          <a className="cc-mini" href={tokenUrl} target="_blank" rel="noreferrer">
            GitHub ↗<span className="visually-hidden"> (new tab)</span>
          </a>
        </li>
        <li className="cc-step">
          <span className="n" aria-hidden="true">
            2
          </span>
          <div>
            <b>Add it to Vercel as GITHUB_TOKEN</b>
            <span>then Redeploy</span>
          </div>
          <a className="cc-mini" href={vercelUrl} target="_blank" rel="noreferrer">
            Vercel ↗<span className="visually-hidden"> (new tab)</span>
          </a>
        </li>
      </ol>
    </section>
  );
}
