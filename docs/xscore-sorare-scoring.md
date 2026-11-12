# Sorare football scoring used in xScore research

The research predicts the **unboosted 0–100 player score** for one eligible match. The final card contribution can differ due to card position and applicable card or competition bonuses. A player score of 70 gives 77 with a 10% card bonus. The position assigned when a card is minted stays with that card. A new card can have a different position and get a different score for the same performance. Standard double gameweeks count the higher eligible score. Fixture-specific modes such as Pro and Arcade use the selected game. Check the competition and the actual game Sorare credited before comparing a gameweek score. Keep the score pending during review, then use the settled value for accuracy.

## Decisive score

An appearance starts at level zero, worth 35 points. A player coming on from the bench starts at the same level. An unused player has no played score. Add one level for each positive decisive and subtract one for each negative decisive. Opposing events can cancel, so a level-zero appearance may have had decisive actions.

| Net level | -3 or lower | -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 or higher |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Decisive points | 0 | 5 | 15 | 35 | 60 | 70 | 80 | 90 | 100 |

- **Positive**. Goal, goal assist, penalty won that is converted, goal-line clearance, last-man tackle, penalty saved, and a goalkeeper's clean sheet with at least 60 eligible minutes.
- **Negative**. Red card, own goal, penalty conceded, and error leading to a goal. The Sorare 26 rules removed the former goalkeeper negative decisive for conceding three or more goals. Goals conceded still affect all-around points.
- **Final score**. Add all-around points to decisive points. At a positive net level the decisive points are also the minimum. At other levels negative all-around points can reduce the score. Clamp to 0–100. Level 1 with −8 all-around still gives 60. Level 0 with +12 gives 47. Level −1 with +12 gives 27.

## All-around points

All-around points (AA) cover passes, chances, duels, tackles, interceptions, possession changes, defensive actions, fouls, cards and goalkeeping. The same action can carry a different weight by card position. A defender's qualifying clean sheet gives +10 AA. A goalkeeper's qualifying clean sheet is a decisive, with no extra AA for that row. The 60-minute condition excludes extra time. A penalty won can give +3 AA and also lift the decisive level when it is converted. A zero-point decisive row below still counts in the decisive calculation. Yellow cards are −3 AA.

The three defensive bonus categories are interceptions, tackles won and net duels (won minus lost). Double-double gives +4 for reaching two in two categories. Triple-double gives +6 for reaching two in all three. Triple-triple gives +12 for reaching three in all three. Use the provider's bonus rows when auditing a finished score to count each credited bonus once.

This is the observed native v7 matrix in the LaLiga archive. A dash means there is no observed nonzero-count row for the position in that extract. Zero means an observed row contributed zero AA. Use the provider's actual stat breakdown when available. Several rows overlap by design, such as a completed pass into the final third and a completed pass.

| Native stat | GK | DEF | MID | FWD |
| --- | ---: | ---: | ---: | ---: |
| accurate_keeper_sweeper | 3 | – | – | – |
| accurate_long_balls | 0.2 | 0.5 | 0.5 | – |
| accurate_pass | 0.1 | 0.08 | 0.1 | 0.1 |
| adjusted_total_att_assist | 2 | 3 | 2 | 2 |
| assist_penalty_won | – | 0 | 0 | 0 |
| big_chance_created | 3 | 3 | 3 | 3 |
| big_chance_missed | – | -5 | -5 | -5 |
| blocked_cross | – | 1 | 1 | – |
| clean_sheet_60 | 0 | 10 | – | – |
| clearance_off_line | – | 0 | 0 | 0 |
| cross_not_claimed | -3 | – | – | – |
| dive_catch | 3.5 | – | – | – |
| dive_save | 3 | – | – | – |
| double_double | – | 4 | 4 | 4 |
| duel_lost | – | -2 | -0.8 | -1 |
| duel_won | – | 1.5 | 0.8 | 1 |
| effective_clearance | – | 0.5 | – | – |
| error_lead_to_goal | 0 | 0 | 0 | 0 |
| error_lead_to_shot | -5 | -5 | -3 | -3 |
| fouls | -1 | -2 | -1 | -0.5 |
| gk_smother | 5 | – | – | – |
| goal_assist | 0 | 0 | 0 | 0 |
| goals | – | 0 | 0 | 0 |
| goals_conceded | -5 | -4 | -2 | – |
| good_high_claim | 1.5 | – | – | – |
| interception_won | – | 3 | 3 | 3 |
| last_man_tackle | 0 | 0 | 0 | 0 |
| long_pass_own_to_opp_success | – | 0.5 | – | – |
| missed_pass | -0.2 | -0.2 | -0.3 | – |
| ontarget_scoring_att | 3 | 3 | 3 | 3 |
| outfielder_block | – | 2 | 1 | – |
| own_goals | 0 | 0 | 0 | 0 |
| pen_area_entries | – | 0.5 | 0.5 | 0.5 |
| penalty_conceded | 0 | 0 | 0 | 0 |
| penalty_kick_missed | – | -5 | -5 | -5 |
| penalty_save | 0 | – | – | – |
| penalty_won | – | 3 | 3 | 3 |
| poss_lost_ctrl | -0.3 | -0.6 | -0.5 | -0.1 |
| poss_won | – | 0.5 | 0.5 | – |
| punches | 1.5 | – | – | – |
| red_card | 0 | 0 | 0 | 0 |
| saved_ibox | 2 | – | – | – |
| saves | 2 | – | – | – |
| successful_final_third_passes | 0.5 | 0.4 | 0.3 | 0.1 |
| triple_double | – | 6 | 6 | 6 |
| triple_triple | – | 12 | 12 | 12 |
| was_fouled | – | – | 1 | 1 |
| won_contest | – | 0.5 | 0.5 | 0.5 |
| won_tackle | – | 3 | 3 | – |
| yellow_card | -3 | -3 | -3 | -3 |

## Forecast interpretation

The team's fixture difficulty, expected goals and clean-sheet chance describe the opponent and expected game. They add no direct Sorare points. An expected score averages the possibilities and is useful for lineup decisions. A within-seven forecast picks the centre of the 14-point window most likely to contain the result. If a player gets 40 in 60% of games and 80 in 40%, the mean is 56 and the best within-seven prediction is 40. A conditional starter forecast, a conditional played-substitute forecast, the chance of appearing, and the chance-weighted gameweek expectation each answer a different question. Keep them separately labelled in data and comparisons.

Official references include [Football scoring](https://help.sorare.com/hc/en-us/articles/4402904001809-How-does-scoring-work-in-Sorare-Football), [Sorare 26 scoring changes](https://sorare.com/blog/football/sorare-26-prize-pools-competition-structure-more-details), [card position](https://sorare.com/help/a/4403914643345/why-does-the-same-player-have-different-scores-for-the-same-game-week), [coverage and double gameweeks](https://sorare.com/help/a/6016469026717/why-is-my-match-not-covered-in-sorare-football-what-happens-if-the-coverage-is-improved-or-reduced) and [score corrections](https://help.sorare.com/hc/en-us/articles/4588357481885-What-happens-if-there-are-scoring-issues-for-a-Sorare-Football-game).
