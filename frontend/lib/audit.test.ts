import { describe, expect, it } from "vitest";
import {
  bandLabel,
  docUrl,
  interval,
  liveLine,
  lockDay,
  percent,
  readable,
  recordLine,
  sourceStory,
  SOURCES,
  NO_MISSIONS,
  NO_REWARDS,
  wonShare,
  type Audit,
  type LiveSource,
  type XscoreLive,
} from "./audit";

const none: LiveSource = { state: "none", recorded: 0, settled: 0, right: null, brier: null, mean: null, started: null, buckets: null };
const page = (over: Partial<Audit> = {}): Audit => ({
  version: 1,
  generatedAt: "2026-10-02T18:00:00+00:00",
  floor: 100,
  replay: null,
  xscore: { replay: null, live: { state: "none", floor: 100, noted: 0, marked: 0, pairs: 0, weeks: 0, rate: null, lo: null, hi: null } },
  starts: { replay: null, live: { futbolfantasy: none, sorare: none, sofix: none }, weeks: [] },
  rewards: NO_REWARDS,
  missions: NO_MISSIONS,
  ...over,
});

describe("the figures", () => {
  it("writes a share as a whole percent and a missing one as a dash, never as zero", () => {
    expect(percent(0.6596)).toBe("66%");
    expect(percent(0.5)).toBe("50%");
    expect(percent(0)).toBe("0%");
    expect(percent(null)).toBe("–");
    expect(percent(undefined)).toBe("–");
  });

  it("writes the range around a share, and one number when both ends round to it", () => {
    expect(interval(0.6463, 0.6717)).toBe("65–67%");
    expect(interval(0.5, 0.5)).toBe("50%");
    expect(interval(null, 0.6)).toBeNull();
    expect(interval(0.6, null)).toBeNull();
  });

  it("names the bands of what a source said in words", () => {
    expect(bandLabel({ from: 0, to: 0.2, n: 1, said: 0.1, was: 0.1 })).toBe("Under 20%");
    expect(bandLabel({ from: 0.2, to: 0.5, n: 1, said: 0.3, was: 0.4 })).toBe("20–50%");
    expect(bandLabel({ from: 0.5, to: 0.8, n: 1, said: 0.6, was: 0.7 })).toBe("50–80%");
    expect(bandLabel({ from: 0.8, to: 1, n: 1, said: 0.9, was: 0.9 })).toBe("80% or more");
  });

  it("names the day a gameweek locked as Madrid saw it", () => {
    expect(lockDay("2026-10-02T14:00:00+00:00")).toBe("Fri 2 Oct");
    expect(lockDay("2026-10-06T22:30:00+00:00")).toBe("Wed 7 Oct"); // past midnight in Madrid
    expect(lockDay(null)).toBe("");
  });

  it("points at a document of the repository", () => {
    expect(docUrl("xscore_success_rate.md", "me/repo")).toBe("https://github.com/me/repo/blob/main/docs/xscore_success_rate.md");
  });
});

describe("what each source says for itself", () => {
  it("gives the share it was right on once it has enough games", () => {
    const live: LiveSource = { ...none, state: "enough", recorded: 140, settled: 120, right: 0.74, brier: 0.17, mean: 0.5, started: 0.5, buckets: [] };
    expect(sourceStory("futbolfantasy", live, 100)).toEqual({ main: "74%", sub: "right on 120 games" });
  });

  it("says too few to tell, with how far along it is, instead of a number", () => {
    const live: LiveSource = { ...none, state: "few", recorded: 30, settled: 12 };
    expect(sourceStory("sofix", live, 100)).toEqual({ main: "Too few to tell", sub: "12 of 100 games checked" });
  });

  it("says it is waiting for the games when they were written down but not played", () => {
    const live: LiveSource = { ...none, state: "waiting", recorded: 21 };
    expect(sourceStory("sofix", live, 100)).toEqual({ main: "Waiting for results", sub: "21 games written down before the lock" });
    expect(sourceStory("sofix", { ...live, recorded: 1 }, 100).sub).toBe("1 game written down before the lock");
  });

  it("says why there is nothing, in that source's own terms", () => {
    expect(sourceStory("sorare", none, 100).main).toBe("Nothing yet");
    expect(sourceStory("sorare", none, 100).sub).toMatch(/Sorare has not given a start chance/);
    expect(sourceStory("futbolfantasy", none, 100).sub).toMatch(/LaLiga/);
    expect(sourceStory("sofix", none, 100).sub).toMatch(/before each lock/);
  });
});

describe("the live check of the xScore", () => {
  const live = (over: Partial<XscoreLive>): XscoreLive => ({ state: "none", floor: 100, noted: 0, marked: 0, pairs: 0, weeks: 0, rate: null, lo: null, hi: null, ...over });

  it("says what it is waiting for, in plain words", () => {
    expect(liveLine(live({}))).toMatch(/first gameweek/);
    expect(liveLine(live({ state: "waiting", noted: 14 }))).toBe("14 players were written down before the lock. Their gameweeks are not played yet.");
    expect(liveLine(live({ state: "waiting", noted: 1 }))).toBe("1 player was written down before the lock. His gameweek is not played yet.");
  });

  it("says too few to tell until the floor, then gives the share", () => {
    expect(liveLine(live({ state: "few", pairs: 30 }))).toBe("30 pairs so far: too few to tell. It shows here from 100.");
    expect(liveLine(live({ state: "enough", pairs: 130, rate: 0.64, lo: 0.58, hi: 0.69 }))).toBe(
      "64% (58–69%) on 130 pairs since the first lock.",
    );
  });
});

describe("the record", () => {
  it("counts what was written down and what has been checked", () => {
    expect(recordLine({ slug: "gw", lock: null, games: 21, settled: 0, sources: { futbolfantasy: 0, sorare: 0, sofix: 21 } })).toBe(
      "21 games written down · 0 checked",
    );
    expect(recordLine({ slug: "gw", lock: null, games: 1, settled: 1, sources: { futbolfantasy: 0, sorare: 0, sofix: 1 } })).toBe(
      "1 game written down · 1 checked",
    );
  });
});

describe("reading what the job published", () => {
  it("does not read a page of another version or shape", () => {
    expect(readable(null)).toBeNull();
    expect(readable("audit")).toBeNull();
    expect(readable({ version: 2, xscore: {}, starts: {} })).toBeNull();
    expect(readable({ version: 1 })).toBeNull();
    expect(readable({ version: 1, xscore: {}, starts: null })).toBeNull();
  });

  it("keeps the page as the job wrote it and fills a source it has no entry for with nothing yet", () => {
    const written = page({ starts: { replay: null, live: { sofix: { ...none, state: "waiting", recorded: 3 } } as Audit["starts"]["live"], weeks: [] } });
    const read = readable(written)!;
    expect(read.starts.live.sofix).toMatchObject({ state: "waiting", recorded: 3 });
    for (const source of SOURCES) expect(read.starts.live[source]).toBeDefined();
    expect(read.starts.live.sorare.state).toBe("none");
    expect(read.xscore.live.state).toBe("none");
  });

  it("copes with a page written before a field existed", () => {
    const old = { version: 1, generatedAt: "x", xscore: { replay: null }, starts: { live: {} } };
    const read = readable(old)!;
    expect(read.floor).toBe(100);
    expect(read.starts.weeks).toEqual([]);
    expect(read.xscore.live.state).toBe("none");
    expect(read.replay).toBeNull();
  });
});

describe("the rewards", () => {
  it("reads a page published before the rewards were counted as an empty season", () => {
    const old = { ...page() } as Partial<Audit>;
    delete old.rewards;
    expect(readable(old)?.rewards).toEqual(NO_REWARDS);
  });

  it("gives what was won as a share of what was expected, and nothing when nothing was expected", () => {
    expect(wonShare(330, 412)).toBeCloseTo(0.801, 3);
    expect(wonShare(250, 0)).toBeNull();
  });
});
