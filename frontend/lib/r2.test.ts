import { describe, expect, it } from "vitest";
import { sheetGroup } from "./missionsPool";
import { sameInstant } from "./r2";

describe("page blocks on R2", () => {
  it("takes Python's microsecond time and Neon's millisecond time as the same write", () => {
    expect(sameInstant("2026-10-19T20:38:46.806123+00:00", "2026-10-19T20:38:46.806Z")).toBe(true);
    expect(sameInstant("2026-10-19T20:38:46.807+00:00", "2026-10-19T20:38:46.806Z")).toBe(false);
  });

  it("splits the missions pool exactly as Neon's SQL does (ascii(md5(key)) % 4), so pieces from both fit", () => {
    // Values from Postgres on 20 Oct 2026: SELECT k, ascii(md5(k)) % 4.
    expect(["mbappe-kylian", "lamine-yamal-nasraoui-ebana", "vinicius-jose-paixao-de-oliveira-junior", "x"].map(sheetGroup)).toEqual([1, 3, 3, 1]);
  });
});
