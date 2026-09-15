/**
 * Skeleton while the server loads the grid (only visible on a cold cache or a slow API).
 * Scoped to the (board) route group: a loading boundary above /team/[code] would start streaming a 200
 * before the page can answer 404 for an unknown team.
 */
export default function Loading() {
  const card = (lines: number, key?: number) => (
    <div key={key} className="card bento-card skeleton-card">
      <div className="skeleton skeleton-line short" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton skeleton-line" />
      ))}
    </div>
  );
  return (
    <main aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading fixtures…</span>
      <div className="skeleton skeleton-title" />
      <div className="bento" aria-hidden="true">
        <div className="bento-runs">
          {card(3, 0)}
          {card(3, 1)}
        </div>
        {card(12)}
        {card(12)}
        <div className="ladder-card">{card(16)}</div>
        {card(16)}
      </div>
    </main>
  );
}
