import { describe, expect, it } from "vitest";
import { shownTheme } from "./theme";

describe("shownTheme", () => {
  it("a saved choice wins over the system; without one the system decides", () => {
    expect(shownTheme("light", true)).toBe("light");
    expect(shownTheme("dark", false)).toBe("dark");
    expect(shownTheme(null, true)).toBe("dark");
    expect(shownTheme("bogus", false)).toBe("light");
  });
});
