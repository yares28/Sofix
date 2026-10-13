import { describe, expect, it } from "vitest";
import { nameLinks } from "./sorareChances";

// Atlético v Man United, 13 Oct 2026: the names on Futbol Fantasy's page and the slugs Sorare's page gave for the game.
const PEOPLE = [
  ["7433", "Matheus Cunha"], ["4244", "Bruno Fernandes"], ["9200", "Bryan Mbeumo"], ["7501", "Lisandro Martínez"], ["11892", "Carlos Baleba"],
  ["1", "Álex Baena"], ["2", "Kang-In Lee"], ["1826", "Jan Oblak"], ["3", "Marcos Llorente"],
].map(([id, name]) => ({ id: id!, name: name! }));
const SLUGS = [
  "jan-oblak", "matheus-santos-carneiro-da-cunha", "bruno-miguel-borges-fernandes", "bryan-mbeumo", "lisandro-martinez", "daniel-martinez-moreno",
  "carlos-balepa-noom-quomah", "alejandro-baena-rodriguez", "kang-in-lee", "marcos-llorente-moreno",
];

describe("tying Sorare's players of a game to the people on the page by name", () => {
  it("ties a full name inside a longer slug, then a surname, and leaves alone who the job already tied", () => {
    expect(nameLinks(PEOPLE, SLUGS, { "jan-oblak": "1826" })).toEqual({
      "matheus-santos-carneiro-da-cunha": "7433", "bruno-miguel-borges-fernandes": "4244", "bryan-mbeumo": "9200", "lisandro-martinez": "7501",
      "kang-in-lee": "2", "marcos-llorente-moreno": "3", "alejandro-baena-rodriguez": "1",
    });
  });

  it("ties nobody when two people or two slugs could be each other, or the name is spelled differently", () => {
    const twins = [{ id: "a", name: "Nico Williams" }, { id: "b", name: "Iñaki Williams" }];
    expect(nameLinks(twins, ["williams-arthuer"], {})).toEqual({});
    expect(nameLinks([{ id: "a", name: "Pedro García" }], ["pedro-garcia-lopez", "pedro-garcia-ruiz"], {})).toEqual({});
    expect(nameLinks([{ id: "11892", name: "Carlos Baleba" }], ["carlos-balepa-noom-quomah"], {})).toEqual({});
  });
});
