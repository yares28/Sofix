import HomeTile from "./HomeTile";

const RING = (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
    <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 3" />
  </svg>
);

/**
 * The Sorare row. Its tiles wait for their data (cards: the Sorare sync; lineups: Optimize; the review: the first
 * gameweek played with Sofix lineups) and say what fills them. Never a made-up number (DESIGN.md).
 */
export default function SorareRow() {
  return (
    <>
      <div className="hm-sec">
        <h2>
          <span className="foil limited stack" aria-hidden="true" />
          Sorare
        </h2>
        <span>your lineups, cards and results</span>
      </div>
      <HomeTile id="hm-play" title="Play" className="hm-play hm-wait" index={3}>
        <div className="hm-ghost">
          <span className="shape">{RING}</span>
          <p>
            <b>Best lineups</b>
            <br />
            Arrive with Optimize: the best competition, your lineups and your chance of a reward.
          </p>
        </div>
      </HomeTile>
      <HomeTile id="hm-cards" title="My cards" className="hm-cards hm-wait" index={4}>
        <div className="hm-ghost">
          <span className="shape card" />
          <p>
            <b>Your cards</b>
            <br />
            Arrive with the Sorare sync.
          </p>
        </div>
      </HomeTile>
      <HomeTile id="hm-review" title="Predicted vs actual" className="hm-review hm-wait" index={5}>
        <div className="hm-ghost">
          <span className="shape">{RING}</span>
          <p>
            <b>How close we were</b>
            <br />
            Starts after your first gameweek with Sofix lineups.
          </p>
        </div>
      </HomeTile>
    </>
  );
}
