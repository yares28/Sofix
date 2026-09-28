import { expect, test, type Page } from "@playwright/test";
import { offline, resetBackend } from "./helpers";

/**
 * Apply, against a Sorare that is not there.
 *
 * The real path runs through the owner's signed-in tab, so it cannot be driven from a test. What can be driven
 * is everything on this side of it: `lib/apply.ts` only ever calls `chrome.runtime.sendMessage`, so a stub of
 * that is a whole fake extension. The replies below are the shapes Sorare's own API returns
 * (`previewSo5Lineup`, `createOrUpdateSo5Lineup`, `confirmSo5Lineups`), so a change to how those are read
 * fails here instead of in front of the owner.
 */

type Reply = Record<string, unknown>;

/** What the fake answers for each step, and what the page asked it — read back through `window.__applyCalls`. */
async function fakeExtension(page: Page, replies: Record<string, Reply>) {
  await page.addInitScript((scripted: Record<string, Reply>) => {
    const calls: { step: string; input: Record<string, unknown> }[] = [];
    (window as unknown as { __applyCalls: typeof calls }).__applyCalls = calls;
    (window as unknown as { chrome: unknown }).chrome = {
      runtime: {
        lastError: undefined,
        sendMessage(_id: string, message: Record<string, unknown>, reply: (response: unknown) => void) {
          // The app also pings to ask whether the extension is there at all (lib/extension.ts); a real one
          // answers both, and only the Apply steps are worth recording.
          if (message.type === "ping") {
            setTimeout(() => reply({ ok: true, version: "0.1.0", sorareUser: "Yares", appReachable: true }), 10);
            return;
          }
          const step = String(message.step);
          calls.push({ step, input: message });
          // Chrome answers asynchronously; so does this, or the page would never show its "asking" state.
          setTimeout(() => reply(scripted[step] ?? { state: "error" }), 10);
        },
      },
    };
  }, replies);
}

const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __applyCalls: { step: string; input: Record<string, unknown> }[] }).__applyCalls);

/** Sorare's own answers: nothing entered yet, a clean preview, a saved draft, then a confirmed lineup. */
const NOTHING_ENTERED = {
  state: "ok",
  data: { so5: { so5Leaderboard: { id: "So5Leaderboard:x", teamsCap: 4, mySo5Lineups: [] } } },
};
const PREVIEW_OK = {
  state: "ok",
  data: {
    so5: {
      so5Leaderboard: {
        id: "So5Leaderboard:x",
        previewSo5Lineup: {
          rewardMultiplier: 1.04,
          feedbackRules: [
            { ruleName: "SeasonBonus", state: "VALID", message: "Four in-season cards" },
            { ruleName: "SameClub", state: "VALID", message: "Max two per club" },
          ],
        },
      },
    },
  },
};
const DRAFT_SAVED = {
  state: "ok",
  data: {
    createOrUpdateSo5Lineup: {
      errors: [],
      so5Lineup: { id: "So5Lineup:7", name: "Sofix · plan 1", draft: true, confirmable: true },
    },
  },
};
const ENTERED = {
  state: "ok",
  data: {
    confirmSo5Lineups: {
      errors: [],
      so5Lineups: [{ id: "So5Lineup:7", name: "Sofix · plan 1", draft: false, confirmable: false }],
    },
  },
};

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await offline(page); // Sorare's card art is hot-linked; tests never touch the network
});

test("Apply walks Check, Draft and Enter, and each one is a press of its own", async ({ page }) => {
  await fakeExtension(page, { entered: NOTHING_ENTERED, check: PREVIEW_OK, draft: DRAFT_SAVED, enter: ENTERED });
  await page.goto("/play");
  await page.getByRole("button", { name: "Apply plan" }).click();
  const sheet = page.locator(".ap");
  await expect(sheet).toBeVisible();

  // Opening reads what is already entered, and writes nothing.
  await expect(sheet.locator(".ap-verdict")).toContainText("Nothing of yours is entered here yet.");
  expect((await calls(page)).map((call) => call.step)).toEqual(["entered"]);

  // Check: Sorare's own verdict, still nothing saved.
  await sheet.getByRole("button", { name: "Check with Sorare" }).click();
  await expect(sheet.locator(".ap-verdict")).toContainText("Sorare checked it");
  await expect(sheet.locator(".ap-verdict")).toContainText("reward ×1.04");
  await expect(sheet.locator(".ap-rules")).toContainText("Four in-season cards");
  await expect(sheet.locator(".ap-cap")).toContainText("nothing saved yet"); // Check writes nothing
  await expect(sheet.locator(".ap-foot")).toContainText("A draft can be changed");
  expect((await calls(page)).map((call) => call.step)).toEqual(["entered", "check"]);

  // Draft: saved on Sorare, not entered.
  await sheet.getByRole("button", { name: "Save as a draft" }).click();
  await expect(sheet.locator(".ap-cap")).toContainText("saved as a draft");
  await expect(sheet.locator(".ap-cap")).toContainText("not entered");
  const afterDraft = await calls(page);
  expect(afterDraft.map((call) => call.step)).toEqual(["entered", "check", "draft"]);
  expect(afterDraft[2]!.input.draft).toBeUndefined(); // the extension decides that, never the page
  expect(Array.isArray(afterDraft[2]!.input.appearances)).toBe(true);

  // Enter: the one step that spends a slot, and it carries the draft Sorare just gave back.
  await sheet.getByRole("button", { name: "Enter the competition" }).click();
  await expect(sheet.locator(".ap-verdict")).toContainText("Sorare has it");
  await expect(sheet.locator(".ap-cap")).toContainText("entered");
  const all = await calls(page);
  expect(all.map((call) => call.step)).toEqual(["entered", "check", "draft", "enter"]);
  expect(all[3]!.input.lineupIds).toEqual(["So5Lineup:7"]);
  await expect(sheet.getByRole("button", { name: /Enter the competition|Save as a draft/ })).toHaveCount(0);
});

test("Sorare's refusal is shown in Sorare's words, and nothing moves on", async ({ page }) => {
  const rejected = {
    state: "ok",
    data: {
      createOrUpdateSo5Lineup: {
        errors: [{ code: 422, message: "Carl Starfelt is already in another lineup this gameweek." }],
        so5Lineup: null,
      },
    },
  };
  await fakeExtension(page, { entered: NOTHING_ENTERED, check: PREVIEW_OK, draft: rejected, enter: ENTERED });
  await page.goto("/play");
  await page.getByRole("button", { name: "Apply plan" }).click();
  const sheet = page.locator(".ap");

  await sheet.getByRole("button", { name: "Check with Sorare" }).click();
  await sheet.getByRole("button", { name: "Save as a draft" }).click();

  await expect(sheet.locator(".ap-verdict")).toContainText("Sorare says no");
  await expect(sheet.locator(".ap-says")).toContainText("already in another lineup");
  // The step that spends a slot is not offered, and the refusal did not become an entry.
  await expect(sheet.getByRole("button", { name: "Enter the competition" })).toHaveCount(0);
  expect((await calls(page)).map((call) => call.step)).toEqual(["entered", "check", "draft"]);
});

test("a lineup Sorare already holds is named on the way in", async ({ page }) => {
  const held = {
    state: "ok",
    data: {
      so5: {
        so5Leaderboard: {
          id: "So5Leaderboard:x",
          teamsCap: 4,
          mySo5Lineups: [
            { id: "So5Lineup:1", name: "Mine", draft: false, confirmable: false, so5Appearances: [{ card: { slug: "a" } }] },
            { id: "So5Lineup:2", name: null, draft: true, confirmable: true, so5Appearances: [] },
          ],
        },
      },
    },
  };
  await fakeExtension(page, { entered: held, check: PREVIEW_OK, draft: DRAFT_SAVED, enter: ENTERED });
  await page.goto("/play");
  await page.getByRole("button", { name: "Apply plan" }).click();
  const sheet = page.locator(".ap");

  await expect(sheet.locator(".ap-verdict")).toContainText("2 lineups of yours already here");
  await expect(sheet.locator(".ap-chips")).toContainText("Draft on sorare.com");
  await expect(sheet.locator(".ap-chips")).toContainText("3 of 4 slots left"); // the draft does not spend one
});
