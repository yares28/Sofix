import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pageLayout } from "../components/navigation/PageSkeleton";
import { navigationKey } from "./navigationSkeleton";

describe("navigation skeleton coverage", () => {
  it("covers every page in the route tree, including details and legacy redirects", () => {
    const pages = readdirSync("app", { recursive: true }).map(String).filter(p => /(^|[\\/])page\.tsx$/.test(p));
    expect(pages.length).toBeGreaterThan(20);
    for (const file of pages) {
      const route = `/${file.replaceAll("\\", "/").replace(/(^|\/)\([^/]+\)/g, "").replace(/\/?page\.tsx$/, "").replace(/\[code\]/, "ATL").replace(/\[slug\]/, "david-soria-solis")}`.replaceAll("//", "/");
      expect(pageLayout(new URL(route, "http://localhost")), file).not.toBeNull();
    }
  });

  it("uses the actual alternative-plan and non-LaLiga fixture layouts", () => {
    expect(pageLayout(new URL("http://localhost/audit/strategies?view=plans"))?.kind).toBe("play");
    expect(pageLayout(new URL("http://localhost/audit/strategies"))?.kind).toBe("strategies");
    expect(pageLayout(new URL("http://localhost/fixtures?league=PL"))?.className).toBe("");
    expect(pageLayout(new URL("http://localhost/fixtures?league=PD"))?.className).toBe("ll");
    expect(pageLayout(new URL("http://localhost/api/refresh"))).toBeNull();
    expect(pageLayout(new URL("http://localhost/unknown"))).toBeNull();
  });

  it("isolates geometry by address, selected GW, league and viewport without depending on query order or hash", () => {
    const key = (path: string, width = 1440) => navigationKey(new URL(path, "http://localhost"), width);
    expect(key("/play?w=one&by=sofix")).toBe(key("/play?by=sofix&w=one#plans"));
    expect(key("/play?w=one")).not.toBe(key("/play?w=two"));
    expect(key("/table?league=PD")).not.toBe(key("/table?league=PL"));
    expect(key("/cards", 1440)).not.toBe(key("/cards", 390));
    expect(key("/players/one")).not.toBe(key("/players/two"));
  });
});
