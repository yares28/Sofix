import { matchFixture, nameMatch, type FdrFixture } from "./arcadeFdr";
import type { NextGame } from "./nextGame";

/** Attach only the published board side for the actual participating teams and fixture. */
export function galleryDifficulty(next: NextGame, fixtures: FdrFixture[]): NextGame {
  const game = next.game;
  if (!game.team) return next;
  const home = game.venue === "H" ? game.team : game.opponent;
  const away = game.venue === "H" ? game.opponent : game.team;
  const fixture = matchFixture({ kickoff: game.kickoff, competition: { slug: game.competition }, home: { name: home }, away: { name: away } }, fixtures);
  if (!fixture || !nameMatch(home, fixture.home.name) || !nameMatch(away, fixture.away.name)) return next;
  return { ...next, fdr: game.venue === "H" ? fixture.home : fixture.away };
}
