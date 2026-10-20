import type { Lineup } from "../../lib/play";
import { cashLabel, chanceLabel, essenceLabel, proStep, proVerdict } from "../../lib/play";
import { Cash, Chevron, Essence } from "./bits";

const kickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/** "Sat 18:30" or "Sat 18:30–19:00": when the lineup's games start (all within an hour, so every teamsheet is out by the first). */
function games(pro: NonNullable<Lineup["pro"]>): string | null {
  if (!pro.from) return null;
  const to = pro.to && pro.to !== pro.from ? `–${kickoff(pro.to).split(" ")[1]}` : "";
  return `${kickoff(pro.from)}${to}`;
}

/** Under a lineup's competition name: the Pro step it plays for, when to enter it, and where the same cards are worth more. */
export function ProTags({ lineup }: { lineup: Lineup }) {
  const verdict = proVerdict(lineup);
  const when = lineup.pro ? games(lineup.pro) : null;
  return (
    <>
      {lineup.pro ? <span className="rc-tag pro-step">{proStep(lineup.pro)}</span> : null}
      {when ? <span className="rc-tag">{`Games ${when} · enter once the teams are out`}</span> : null}
      {verdict ? <span className={`rc-tag pro-vs ${verdict.here ? "here" : "there"}`}>{verdict.line}</span> : null}
    </>
  );
}

/** In a lineup's sheet: the Pro-or-Arena sums, and the Pro board's steps still ahead with this lineup's chance of each target. */
export function ProSheet({ lineup }: { lineup: Lineup }) {
  const other = lineup.versus;
  const pro = lineup.pro;
  const boost = pro?.boost ?? 1;
  const when = pro ? games(pro) : null;
  return (
    <>
      {pro && when ? (
        <p className="pl-pro-vs">
          {`Their games start ${when}, so every teamsheet is out before the first kickoff: enter it then, and only if all five start${pro.allStart !== undefined ? ` (${chanceLabel(pro.allStart)} chance they do)` : ""}. If one doesn't, swap him or skip the week: an entry that misses its target sends the board back to step 0.`}
        </p>
      ) : null}
      {other ? (
        <p className="pl-pro-vs">
          {`Here: ${chanceLabel(lineup.pReturn)} chance of a reward. The same five in ${other.comp}: ${chanceLabel(other.pReturn)}. `}
          {`On average they win ${essenceLabel(lineup.worth ?? 0)} here and ${essenceLabel(other.worth)} there, in essence with $1 counted as 300.`}
        </p>
      ) : null}
      {pro ? (
        <details className="pl-ladder" open>
          <summary>
            Pro board <span>· the score each step needs, and this lineup&rsquo;s chance of reaching it if all five start</span>
            <Chevron className="" />
          </summary>
          <table>
            <tbody>
              {pro.ladder.map((step, i) => (
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
