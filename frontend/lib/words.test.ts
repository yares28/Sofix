import { describe, expect, it } from "vitest";
import { noun } from "./words";

describe("the word that goes with a number", () => {
  it("is singular for one only", () => {
    expect(noun(1, "lineup")).toBe("lineup");
    expect(noun(0, "lineup")).toBe("lineups");
    expect(noun(2, "lineup")).toBe("lineups");
    expect(noun(1, "match", "matches")).toBe("match");
    expect(noun(3, "match", "matches")).toBe("matches");
  });
});
