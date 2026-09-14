/**
 * Skeleton while the server loads the grid (only visible on a cold cache or a slow API).
 * Scoped to the (board) route group: a loading boundary above /team/[code] would start streaming a 200
 * before the page can answer 404 for an unknown team.
 */
export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading fixtures…</span>
      <div className="skeleton skeleton-title" />
      <div className="insights" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card insight skeleton-card">
            <div className="skeleton skeleton-line short" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line" />
          </div>
        ))}
      </div>
      <div className="card board skeleton-board" aria-hidden="true">
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="skeleton-row">
            <div className="skeleton skeleton-team" />
            {Array.from({ length: 8 }, (_, col) => (
              <div key={col} className="skeleton skeleton-tile" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
