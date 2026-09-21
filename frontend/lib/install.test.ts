import { describe, expect, it } from "vitest";
import { platformOf } from "./install";

describe("install platform", () => {
  it("tells phones from computers", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36")).toBe("android");
    expect(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36")).toBe("desktop");
  });

  it("spots an iPad, which calls itself a Mac", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
    expect(platformOf(ua, 5)).toBe("ios");
    expect(platformOf(ua, 0)).toBe("desktop");
  });
});
