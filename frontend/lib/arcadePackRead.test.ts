import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPackOdds } from "./arcade";
import { askExtension, pingExtension } from "./extension";

vi.mock("./extension", async importOriginal => ({ ...await importOriginal<typeof import("./extension")>(), askExtension: vi.fn(), pingExtension: vi.fn() }));
const answer = { ok: true, state: "ok", data: { currentUser: { setBoard: { myCurrentStep: { cardPacks: [{ slug: "gold", s0: [{ gameplayTier: "GOAT", probabilityBasisPoint: 10_000, playerOdds: [{ probabilityBasisPoint: 10_000, player: { slug: "i" }, team: null }] }] }] } } } } };

describe("explicit pack odds reading", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(pingExtension).mockResolvedValue({ version: "0.4.18", sorareUser: "owner", appReachable: true });
  });
  it("refuses a failed later slot batch rather than replacing a complete saved reading with a prefix", async () => {
    vi.mocked(askExtension).mockResolvedValueOnce(answer).mockResolvedValueOnce({ ok: true, state: "failed" });
    expect(await readPackOdds(3)).toBeNull();
    expect(askExtension).toHaveBeenCalledTimes(2);
  });
  it("requires the extension that reads tiers and returns a full successful reading", async () => {
    vi.mocked(pingExtension).mockResolvedValueOnce({ version: "0.4.14", sorareUser: "owner", appReachable: true });
    expect(await readPackOdds(1)).toBe("outdated");
    expect(askExtension).not.toHaveBeenCalled();
    vi.mocked(askExtension).mockResolvedValue(answer);
    expect(await readPackOdds(1)).toMatchObject({ tiers: { gold: [{ tiers: { GOAT: 1 } }] } });
  });
});
