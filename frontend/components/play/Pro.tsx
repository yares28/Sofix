import type { Lineup, ProBoard, ProWindow } from "../../lib/play";
import { cashLabel, chanceLabel, essenceLabel, proStep } from "../../lib/play";
import { ComparisonCards } from "../recap/LineupComparison";
import { Cash, Chevron, Essence } from "./bits";

const kickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/** "Sat 18:30" or "Sat 18:30–19:00": when the lineup's games start (all within an hour, so every teamsheet is out by the first). */
function games(pro: { from?: string | null; to?: string | null }): string | null {
  if (!pro.from) return null;
  const to = pro.to && pro.to !== pro.from ? `–${kickoff(pro.to).split(" ")[1]}` : "";
  return `${kickoff(pro.from)}${to}`;
}

/** Under a lineup's competition name: the Pro step it plays for and when to enter it. */
export function ProTags({ lineup }: { lineup: Lineup }) {
  const when = lineup.pro ? games(lineup.pro) : null;
  return (
    <>
      {lineup.pro ? <span className="rc-tag pro-step">{proStep(lineup.pro)}</span> : null}
      {when ? <span className="rc-tag">{`Games ${when} · enter once the teams are out`}</span> : null}
    </>
  );
}

/** In a Pro lineup's sheet: when to enter it, and the Pro board's steps still ahead with this lineup's chance of each target. */
export function ProSheet({ lineup }: { lineup: Lineup }) {
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

/**
 * Each Pro board played on the teamsheets (the owner, 29 Oct 2026: "if I know who starts and input them in Pro, can I get the next
 * step?"): its best groups of games, the five to enter if they all start, and the next step's chance once the teams are out.
 */
export function ProBoards({ boards }: { boards: ProBoard[] }) {
  return (
    <section className="pl-board pl-pro-boards" aria-labelledby="pl-pro-title">
      <div className="pl-board-head">
        <h2 id="pl-pro-title">Pro · once the teams are out</h2>
      </div>
      {boards.map((board) => {
        const step = board.steps[0];
        if (!step) return null;
        return (
          <section key={board.key} className="pl-pro-board" aria-label={board.comp}>
            <h3>
              {board.comp}
              <span className="rc-tag pro-step">{`Step ${step.level} · ${step.target}+`}</span>
              <span className="pl-pro-prize">
                {step.cash ? <><Cash size={12} /> {cashLabel(step.cash)}</> : null}
                {step.essence ? <><Essence size={12} /> {essenceLabel(step.essence)}</> : null}
              </span>
            </h3>
            {board.windows.map((group) => (
              <ProWindowRow key={group.from} group={group} />
            ))}
          </section>
        );
      })}
    </section>
  );
}

function ProWindowRow({ group }: { group: ProWindow }) {
  return (
    <div className="rc-lu pl-pro-win">
      <div className="rc-lu-c">
        <b>{games(group)}</b>
        <span>{`xScore ${group.x}`}</span>
      </div>
      <ComparisonCards
        cards={group.starters.map((card) => ({
          slug: card.slug,
          player: card.player,
          name: card.name,
          picture: card.pic ?? null,
          rarity: card.rarity,
          captain: !!card.captain,
          x: card.x,
          score: null,
          why: "Not played yet",
        }))}
      />
      <div className="rc-score">
        <div className="rc-score-pair">
          <div>
            <span>Once the teams are out</span>
            <b>{chanceLabel(group.wait[0] ?? 0)}</b>
          </div>
          <div className="rc-xd">
            <span>If these five start</span>
            <b>{chanceLabel(group.ifStart[0] ?? 0)}</b>
          </div>
        </div>
      </div>
      <div className="rc-rew">
        <div className="rc-any">
          <b>{chanceLabel(group.allStart)}</b>
          <span>All five start</span>
        </div>
      </div>
    </div>
  );
}
