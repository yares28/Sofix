/** WCAG 2.x contrast helpers (used by tests to keep the colour tokens accessible). */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** A colour drawn at `opacity` over an opaque background, as the browser composites it. */
export function blend(foreground: string, background: string, opacity: number): string {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  return `#${fg
    .map((c, i) => Math.round(c * opacity + bg[i]! * (1 - opacity)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Custom properties declared in a stylesheet's :root block. */
export function rootTokens(css: string): Record<string, string> {
  const root = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  return Object.fromEntries(
    [...root.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}
