import type { PlayerKind } from "../../lib/lineups";

/** The small round marks for what the site says of a player. Drawn in place of words; each has a text alternative. */

export const KIND_LABEL: Record<PlayerKind, string> = {
  out: "Out",
  doubt: "Doubt",
  suspended: "Suspended",
  available: "Knock, but available",
};

export function KindIcon({ kind, size = 20, ring = false }: { kind: PlayerKind; size?: number; ring?: boolean }) {
  const edge = ring ? { stroke: "#fff", strokeWidth: 1.6 } : {};
  const common = { role: "img" as const, "aria-label": KIND_LABEL[kind], width: size, height: size, viewBox: "0 0 18 18" };
  if (kind === "out") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="8.2" fill="#c4312a" {...edge} />
        <path d="M9 5.2v7.6M5.2 9h7.6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "doubt") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="8.2" fill="#c47100" {...edge} />
        <path d="M6.9 7.1a2.2 2.2 0 1 1 3.2 2c-.7.35-1.1.75-1.1 1.5v.3" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="9" cy="13.4" r="1.05" fill="#fff" />
      </svg>
    );
  }
  if (kind === "suspended") {
    return (
      <svg {...common}>
        <rect x="5" y="2.2" width="8.4" height="12.6" rx="1.6" fill="#d92d20" transform="rotate(12 9 9)" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="9" r="8.2" fill="#1a7a4e" {...edge} />
      <path d="M5.3 9.2l2.4 2.4 5-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CalledUpIcon({ size = 20, ring = false }: { size?: number; ring?: boolean }) {
  return (
    <svg role="img" aria-label="Called up by his national team" width={size} height={size} viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="8.2" fill="#1d4ed8" {...(ring ? { stroke: "#fff", strokeWidth: 1.6 } : {})} />
      <path d="M6 13V5.2M6 5.4c1.6-.9 2.9.6 4.6-.1v4c-1.7.7-3-.8-4.6.1" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The country a player is called up by: his two letters on a blue pill, and the country's name for a screen reader. */
export function CalledUpMark({ code, sample = false }: { code: string; sample?: boolean }) {
  const country = (() => {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  })();
  return (
    <span className={`lu-call${sample ? " lu-call-key" : ""}`} role="img" aria-label={`Called up by ${country}`} title={`Called up by ${country}`}>
      {code.toUpperCase()}
    </span>
  );
}

export function InfoIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.6" />
      <path d="M8 7.2v4" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.4" fill="currentColor" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5h4v4" />
      <path d="M13.5 2.5L7.5 8.5" />
      <path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
    </svg>
  );
}

export function RotationIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9L13.5 5.5" />
      <path d="M13.5 2.5v3h-3" />
      <path d="M13.5 8a5.5 5.5 0 0 1-9.4 3.9L2.5 10.5" />
      <path d="M2.5 13.5v-3h3" />
    </svg>
  );
}

export function TargetIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.3" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.6" fill="currentColor" />
    </svg>
  );
}
