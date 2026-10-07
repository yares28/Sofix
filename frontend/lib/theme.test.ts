import { describe, expect, it } from "vitest";
import { shownTheme } from "./theme";

describe("shownTheme", () => {
  it("light unless dark was picked", () => {
    expect(shownTheme("light")).toBe("light");
    expect(shownTheme("dark")).toBe("dark");
    expect(shownTheme(null)).toBe("light");
    expect(shownTheme("bogus")).toBe("light");
  });
});
