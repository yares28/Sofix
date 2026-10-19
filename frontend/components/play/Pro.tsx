import type { Lineup } from "../../lib/play";
import { cashLabel, chanceLabel, essenceLabel, proStep, proVerdict } from "../../lib/play";
import { Cash, Chevron, Essence } from "./bits";

/** Under a lineup's competition name: the Pro step it plays for, and whether the same cards are worth more in the other mode. */
export function ProTags({ lineup }: { lineup: Lineup }) {
  const verdict = proVerdict(lineup);
  return (
    <>
      {lineup.pro ? <span className="rc-tag pro-step">{proStep(lineup.pro)}</span> : null}
      {verdict ? <span className={`rc-tag pro-vs ${verdict.here ? "here" : "there"}`}>{verdict.line}</span> : null}
    </>
  );
}

/** In a lineup's sheet: the Pro-or-Arena sums, and the Pro board's steps still ahead with this lineup's chance of each target. */
export function ProSheet({ lineup }: { lineup: Lineup }) {
  const other = lineup.versus;
  const boost = lineup.pro?.boost ?? 1;
  return (
    <>
      {other ? (
        <p className="pl-pro-vs">
          {`Here: ${chanceLabel(lineup.pReturn)} chance of a reward. The same five in ${other.comp}: ${chanceLabel(other.pReturn)}. `}
          {`On average they win ${essenceLabel(lineup.worth ?? 0)} here and ${essenceLabel(other.worth)} there, in essence with $1 counted as 300.`}
        </p>
      ) : null}
      {lineup.pro ? (
        <details className="pl-ladder" open>
          <summary>
            Pro board <span>· the score each step needs, and this lineup&rsquo;s chance of reaching it</span>
            <Chevron className="" />
          </summary>
          <table>
            <tbody>
              {lineup.pro.ladder.map((step, i) => (
                <tr key={step.level} className={i === 0 ? "now" : ""}>
                  <td>{`Step ${step.level} · ${step.target}+${i === 0 ? " · this week" : ""}`}</td>
                  <td>
                    {step.cash ? (
                      <>
                        <Cash size={12} /> {cashLabel(step.cash * boost)}{" "}
                      </>
                    ) : null}
                    {step.essence ? (
                      <>
                        <Essence size={12} /> {essenceLabel(step.essence * boost)}
                      </>
                    ) : null}
                  </td>
                  <td>{chanceLabel(step.p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pl-pro-note">
            Only the first step is played for this week; clearing it opens the next on a later matchday. Enter it on Sorare&rsquo;s Pro board: Apply leaves Pro out.
          </p>
        </details>
      ) : null}
    </>
  );
}
