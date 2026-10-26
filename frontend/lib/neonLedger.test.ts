import { describe, expect, it } from "vitest";
import { ledgerLabel, ledgerRow } from "./neonLedger";

describe("the web side of the Neon ledger", () => {
  it("names a read by its table, and a page block by its kind", () => {
    expect(ledgerLabel("SELECT payload, updated_at FROM read_models WHERE key = $1", "audit_players:2026-10")).toBe(
      "read_models:audit_players",
    );
    expect(ledgerLabel("SELECT max(updated_at) AS at FROM read_models", undefined)).toBe("read_models");
    expect(ledgerLabel("INSERT INTO read_models (key) VALUES ($1)", "x")).toBe("write");
  });

  it("writes one short-keyed row with the biggest readers first", () => {
    const readers = new Map(Array.from({ length: 15 }, (_, i) => [`t${i}`, i * 10] as [string, number]));
    const row = ledgerRow(readers, "ab12cd34", "vercel fra1", 3, new Date("2026-10-27T08:00:00Z"));
    expect(row.key).toBe("neon_ledger:20261027:v-ab12cd34-3");
    expect(row.payload.workflow).toBe("web");
    expect(row.payload.bytes).toBe(1050);
    expect(Object.keys(row.payload.top)).toHaveLength(12);
    expect(Object.keys(row.payload.top)[0]).toBe("t14");
  });
});
