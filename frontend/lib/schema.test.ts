import { describe, expect, it } from "vitest";
import { GridResponseSchema } from "./schema";

function payload() {
  return {
    success: true,
    error: null,
    meta: { last_synced_at: "2026-09-14T11:58:09Z", last_predicted_at: "2026-09-14T11:58:07Z" },
    data: {
      season: "2026/27",
      current_matchday: 5,
      model_version: "dixon-coles-v1+e09e4ba5",
      lens_scales: {
        overall: { cuts: [37.4, 48.6, 61.1, 71.3], higher_is_easier: false },
        attack: { cuts: [2, 1.6, 1.2, 0.9], higher_is_easier: true },
        defence: { cuts: [0.45, 0.35, 0.25, 0.18], higher_is_easier: true },
        odds: { cuts: [0.55, 0.48, 0.36, 0.21], higher_is_easier: true },
      },
      matchdays: [{ number: 5, date_from: "2026-09-11T19:00:00Z", date_to: "2026-09-14T19:00:00Z", finished: false }],
      teams: [
        {
          code: "FCB",
          name: "Barcelona",
          color: "#a50044",
          crest_url: "https://crests.football-data.org/81.png",
          cells: [
            [
              {
                fixture_id: 1, opponent_code: "LEV", venue: "H", kickoff_utc: "2026-09-12T19:00:00Z", date_confirmed: true,
                rescheduled: false, status: "scheduled", result: null, weather: null,
                prediction: {
                  difficulty: 28.4, label: "Easy", bucket: 1, expected_points: 2.15,
                  probabilities: { win: 0.68, draw: 0.19, loss: 0.13 }, clean_sheet: 0.41, xg_for: 2.1, xg_against: 0.8,
                },
              },
            ],
          ],
        },
      ],
    },
  };
}

describe("GridResponseSchema", () => {
  it("accepts a real-shaped payload and an empty-database answer", () => {
    expect(GridResponseSchema.safeParse(payload()).success).toBe(true);
    expect(GridResponseSchema.safeParse({ success: false, data: null, error: "No fixtures yet.", meta: null }).success).toBe(true);
  });

  it.each([
    ["an out-of-range bucket", (p: ReturnType<typeof payload>) => { p.data.teams[0]!.cells[0]![0]!.prediction.bucket = 7; }],
    ["a crest from another host", (p: ReturnType<typeof payload>) => { p.data.teams[0]!.crest_url = "https://evil.example/x.png"; }],
    ["a bad colour", (p: ReturnType<typeof payload>) => { p.data.teams[0]!.color = "red;background:url(x)"; }],
    ["a probability above 1", (p: ReturnType<typeof payload>) => { p.data.teams[0]!.cells[0]![0]!.prediction.probabilities.win = 1.4; }],
    ["a missing field", (p: ReturnType<typeof payload>) => { delete (p.data as Partial<typeof p.data>).lens_scales; }],
    ["an unparseable date", (p: ReturnType<typeof payload>) => { p.data.matchdays[0]!.date_from = "soon"; }],
  ])("rejects %s", (_name, mutate) => {
    const bad = payload();
    mutate(bad);
    expect(GridResponseSchema.safeParse(bad).success).toBe(false);
  });
});
