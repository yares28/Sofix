import { describe, expect, it } from "vitest";
import { qrCode } from "./qr";

const cellsOf = (modules: string) =>
  [...modules.matchAll(/M(\d+) (\d+)h(\d+)/g)].map(([, x, y, run]) => ({ x: Number(x), y: Number(y), run: Number(run) }));

describe("qr code", () => {
  const qr = qrCode("https://sofix-yares.vercel.app/");

  it("is a version 4 code (33 modules) with its three corner squares", () => {
    expect(qr.size).toBe(33);
    expect(qr.finders).toEqual([
      [0, 0],
      [26, 0],
      [0, 26],
    ]);
  });

  it("leaves the middle free for the stripe mark, with a one-module margin", () => {
    expect(qr.logo).toEqual({ at: 13, size: 7 });
    const cells = cellsOf(qr.modules);
    expect(cells.length).toBeGreaterThan(100);
    expect(cells.some(({ x, y, run }) => y >= 12 && y <= 20 && x <= 20 && x + run - 1 >= 12)).toBe(false);
  });

  it("draws the corner squares itself, not as modules", () => {
    expect(cellsOf(qr.modules).some(({ x, y }) => x < 7 && y < 7)).toBe(false);
  });

  it("is the same for the same address", () => {
    expect(qrCode("https://sofix-yares.vercel.app/")).toEqual(qr);
  });
});
