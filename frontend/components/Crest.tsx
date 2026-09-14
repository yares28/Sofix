import type { GridTeam } from "../lib/types";

/** Relative luminance check so light club colours get dark text. */
function isLight(hex: string): boolean {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}

// Colour badge with the club code. No club crests: team names and colours only.
export default function Crest({ team }: { team: Pick<GridTeam, "code" | "color"> }) {
  return (
    <div className="crest" style={{ background: team.color, color: isLight(team.color) ? "#1d1d1f" : "#fff" }} aria-hidden>
      {team.code}
    </div>
  );
}
