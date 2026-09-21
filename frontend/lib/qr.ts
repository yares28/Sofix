import { encode } from "uqr";

/** A QR code ready to draw: the dark modules as one SVG path, the three corner squares and the free middle. */
export type QrCode = { size: number; modules: string; finders: [number, number][]; logo: { at: number; size: number } };

const FINDER = 7; // the corner squares are 7 × 7 modules
const POSITION = 2; // uqr's module type for the corner squares

/**
 * The app's address as a QR code, for opening it on the phone. Server-side only (keeps uqr out of the browser).
 * High error correction lets the stripe mark sit in the middle: scanners rebuild the few modules it covers.
 */
export function qrCode(text: string): QrCode {
  const { size, data, types } = encode(text, { ecc: "H", border: 0 });
  // An odd number of modules centres the mark exactly; about a fifth of the width stays well inside what "H" recovers.
  const logoSize = Math.max(5, Math.round(size / 5) | 1);
  const at = (size - logoSize) / 2;
  const inLogo = (x: number, y: number) => x >= at - 1 && x < at + logoSize + 1 && y >= at - 1 && y < at + logoSize + 1;

  let modules = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      const dark = (col: number) => Boolean(data[y]?.[col]) && types[y]?.[col] !== POSITION && !inLogo(col, y);
      if (!dark(x)) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && dark(x + run)) run++;
      modules += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return {
    size,
    modules,
    finders: [
      [0, 0],
      [size - FINDER, 0],
      [0, size - FINDER],
    ],
    logo: { at, size: logoSize },
  };
}
