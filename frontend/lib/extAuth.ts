import { timingSafeEqual } from "node:crypto";

/**
 * Whether a request to an /api/ext route carries the extension's bearer token (EXTENSION_TOKEN). The comparison
 * is constant-time, and a token that is unset or too short to be one never authorises anything.
 */
export function authorised(request: { headers: Headers }): boolean {
  const expected = process.env.EXTENSION_TOKEN ?? "";
  if (expected.length < 32) return false;
  const [scheme, supplied] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
