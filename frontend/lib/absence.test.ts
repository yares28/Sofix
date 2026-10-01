import { describe, expect, it } from "vitest";
import { absenceText } from "./absence";

const TODAY = new Date("2026-10-01T10:00:00Z"); // Thu 1 Oct 2026 in Madrid, when the live pages were reviewed

const out = (entry: Parameters<typeof absenceText>[0], round: number | null = 8, now = TODAY) => absenceText(entry, round, now);

describe("the diagnoses Futbol Fantasy wrote on 1 Oct, in English", () => {
  // Every cause on the ten round-8 pages that day, each with the words the page shows now.
  const SEEN: [string, string][] = [
    ["Rotura de lig. cruzado anterior", "ACL tear"],
    ["Rotura de ligamento cruzado y menisco", "ACL and meniscus tear"],
    ["Rotura de menisco", "Meniscus tear"],
    ["Rotura completa del tendón proximal del bíceps femoral", "Complete tear of the proximal hamstring tendon"],
    ["Rotura en los isquiotibiales", "Hamstring tear"],
    ["Rotura en el recto anterior", "Rectus femoris tear"],
    ["Lesión en el cuádriceps", "Quadriceps injury"],
    ["Lesión de rodilla", "Knee injury"],
    ["Lesión en el sóleo", "Soleus injury"],
    ["Lesión en los isquiotibiales", "Hamstring injury"],
    ["Lesión en el aductor", "Adductor injury"],
    ["Lesión muscular en el muslo", "Thigh muscle injury"],
    ["Lesión en el recto femoral", "Rectus femoris injury"],
    ["Lesión en el recto anterior", "Rectus femoris injury"],
    ["Lesión en el bíceps femoral", "Biceps femoris injury"],
    ["Lesión de tobillo", "Ankle injury"],
    ["Lesión en el isquiosural", "Hamstring injury"],
    ["Sobrecarga muscular", "Muscle overload"],
    ["Sobrecarga en el obturador", "Obturator overload"],
    ["Sobrecarga en los isquiotibiales", "Hamstring overload"],
    ["Molestias en el pubis", "Pubis discomfort"],
    ["Molestias musculares", "Muscle discomfort"],
    ["Molestias en el tobillo", "Ankle discomfort"],
    ["Molestias en el cuádriceps", "Quadriceps discomfort"],
    ["Molestias en el menisco", "Meniscus discomfort"],
    ["Molestias en la rodilla", "Knee discomfort"],
    ["Molestias en los isquiotibiales", "Hamstring discomfort"],
    ["Molestias en el aductor", "Adductor discomfort"],
    ["Molestias sin determinar", "Unspecified discomfort"],
    ["Molestias en el talón", "Heel discomfort"],
    ["Molestias en el pie", "Foot discomfort"],
    ["Molestias en el psoas", "Psoas discomfort"],
    ["Contractura muscular", "Muscle contracture"],
    ["Contusión en el muslo", "Thigh bruise"],
    ["Edema en el bíceps femoral", "Biceps femoris oedema"],
    ["Esguince de tobillo", "Ankle sprain"],
    ["Esguince de rodilla", "Knee sprain"],
    ["Fractura de tibia", "Tibia fracture"],
    ["Fractura de clavícula", "Collarbone fracture"],
    ["Fractura de muñeca", "Wrist fracture"],
    ["Luxación de hombro", "Shoulder dislocation"],
    ["Tendinopatía en el hombro", "Shoulder tendinopathy"],
    ["Parameniscitis en la rodilla", "Knee parameniscitis"],
    ["Operado de la tibia", "Tibia surgery"],
    ["Operado del menisco", "Meniscus surgery"],
    ["Sometido a artroscopia en la rodilla", "Knee arthroscopy"],
    ["Trabajo al margen", "Training apart"],
    ["Roja directa", "Straight red card"],
    ["Doble amarilla", "Second yellow card"],
  ];

  it.each(SEEN)("%s is %s", (spanish, english) => {
    expect(out({ name: "a", kind: "out", cause: spanish })).toEqual({ cause: english });
  });

  it("ignores case and spacing", () => {
    expect(out({ name: "a", kind: "out", cause: "  ROTURA  de lig. cruzado anterior " }).cause).toBe("ACL tear");
  });

  it("keeps a diagnosis it does not know as the site wrote it, and says they are the site's words", () => {
    expect(out({ name: "a", kind: "out", cause: "Pubalgia" })).toEqual({ cause: "Pubalgia", causeFf: true });
    expect(out({ name: "a", kind: "out", cause: "Lesión en el hígado" })).toEqual({ cause: "Lesión en el hígado", causeFf: true });
  });
});

describe("the status words", () => {
  it("says available, doubtful and out for the round in English", () => {
    expect(out({ name: "a", kind: "available", note: "Disponible para la jornada 8" }).note).toBe("Available for round 8");
    expect(out({ name: "a", kind: "doubt", note: "Duda para la jornada 8" }).note).toBe("Doubt for round 8");
    expect(out({ name: "a", kind: "out", note: "Baja confirmada para la jornada 8" }).note).toBe("Out for round 8");
  });

  it("turns the date he started missing games into since 12 Sep", () => {
    expect(out({ name: "a", kind: "doubt", since: "Desde 12/09 (18 días)" }).since).toBe("since 12 Sep");
    expect(out({ name: "a", kind: "doubt", since: "Desde 4/1" }).since).toBe("since 4 Jan");
  });

  it("says a suspended player misses the round when the site gives nothing else", () => {
    expect(out({ name: "a", kind: "suspended" }, 8).note).toBe("Misses round 8");
    expect(out({ name: "a", kind: "suspended" }, null).note).toBe("Suspended");
    expect(out({ name: "a", kind: "suspended", note: "Baja hasta octubre" }, 8).note).toBe("Out until October");
  });

  it("leaves a note it does not know as the site wrote it, marked as the site's", () => {
    expect(out({ name: "a", kind: "out", note: "Sin fecha de vuelta" })).toEqual({ note: "Sin fecha de vuelta", noteFf: true });
    expect(out({ name: "a", kind: "out" })).toEqual({});
  });
});

describe("until when", () => {
  const until = (note: string, since?: string, now = TODAY) => out({ name: "a", kind: "out", note, since }, 8, now).note;

  it("writes months, parts of a month and days in English", () => {
    expect(until("Baja hasta octubre")).toBe("Out until October");
    expect(until("Baja hasta principios de noviembre")).toBe("Out until early November");
    expect(until("Baja hasta mediados de diciembre")).toBe("Out until mid-December");
    expect(until("Baja hasta finales de octubre")).toBe("Out until late October");
    expect(until("Baja hasta el 12 de octubre")).toBe("Out until 12 October");
    expect(until("Baja hasta noviembre-diciembre")).toBe("Out until November–December");
    expect(until("Baja hasta setiembre", "Desde 05/08")).toBe("Was due back September");
  });

  it("keeps the year when the site gives one", () => {
    expect(until("Baja hasta enero 2027")).toBe("Out until January 2027");
    expect(until("Baja hasta mayo 2027")).toBe("Out until May 2027");
    expect(until("Baja hasta finales de enero 2027")).toBe("Out until late January 2027");
  });

  it("reads the site's own typo", () => {
    expect(until("Baja hasta princpios de octubre", "Desde 20/09")).toBe("Out until early October");
  });

  it("never promises a return that has gone by", () => {
    expect(until("Baja hasta finales de septiembre", "Desde 05/08 (57 días)")).toBe("Was due back late September");
    expect(until("Baja hasta enero 2026")).toBe("Was due back January 2026");
    // "early October" is the first ten days: still ahead on the 1st, gone by the 11th.
    expect(until("Baja hasta principios de octubre", "Desde 20/09")).toBe("Out until early October");
    expect(until("Baja hasta principios de octubre", "Desde 20/09", new Date("2026-10-11T10:00:00Z"))).toBe("Was due back early October");
  });

  it("places a month without a year after the day he started missing games", () => {
    expect(until("Baja hasta abril", "Desde 04/09")).toBe("Out until April"); // April 2027, not April gone by
    expect(until("Baja hasta enero", "Desde 10/08")).toBe("Out until January");
    expect(until("Baja hasta septiembre")).toBe("Out until September"); // no start date: the one still to come
  });
});
