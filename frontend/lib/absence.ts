/**
 * The words Futbol Fantasy writes beside an injury or a ban, in English (plans/review-fixes.md, step 1.3).
 *
 * Three parts: the diagnosis ("Rotura de lig. cruzado anterior"), when it began ("Desde 12/09 (18 días)") and the note about
 * the next game or the return ("Duda para la jornada 8", "Baja hasta finales de septiembre"). A pattern is translated; anything
 * the tables do not know keeps the site's words and is flagged (`causeFf`, `noteFf`) so the page can say whose they are.
 */
import type { PlayerKind } from "./lineups";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SPANISH_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};
const MONTH_NAMES = Object.keys(SPANISH_MONTHS).join("|");

// ---------------------------------------------------------------------------------------------------- the diagnosis
const WHOLE: Record<string, string> = {
  "trabajo al margen": "Training apart",
  "roja directa": "Straight red card",
  "doble amarilla": "Second yellow card",
  "sobrecarga muscular": "Muscle overload",
  "molestias musculares": "Muscle discomfort",
  "contractura muscular": "Muscle contracture",
  "lesión muscular en el muslo": "Thigh muscle injury",
  "molestias sin determinar": "Unspecified discomfort",
  "rotura de ligamento cruzado y menisco": "ACL and meniscus tear",
  "rotura completa del tendón proximal del bíceps femoral": "Complete tear of the proximal hamstring tendon",
};

/** What happened to the part, as the English noun that follows it: "knee" + "injury". */
const KINDS: Record<string, string> = {
  rotura: "tear",
  lesión: "injury",
  molestias: "discomfort",
  sobrecarga: "overload",
  esguince: "sprain",
  fractura: "fracture",
  contusión: "bruise",
  edema: "oedema",
  luxación: "dislocation",
  tendinopatía: "tendinopathy",
  parameniscitis: "parameniscitis",
  operado: "surgery",
  "sometido a artroscopia": "arthroscopy",
};

const PARTS: Record<string, string> = {
  rodilla: "Knee",
  tobillo: "Ankle",
  tibia: "Tibia",
  clavícula: "Collarbone",
  muñeca: "Wrist",
  hombro: "Shoulder",
  pubis: "Pubis",
  aductor: "Adductor",
  cuádriceps: "Quadriceps",
  isquiotibiales: "Hamstring",
  isquiosural: "Hamstring",
  "bíceps femoral": "Biceps femoris",
  "recto anterior": "Rectus femoris",
  "recto femoral": "Rectus femoris",
  sóleo: "Soleus",
  psoas: "Psoas",
  talón: "Heel",
  pie: "Foot",
  muslo: "Thigh",
  menisco: "Meniscus",
  "lig. cruzado anterior": "ACL",
  "ligamento cruzado anterior": "ACL",
  obturador: "Obturator",
};

const clean = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
const KIND_AND_PART = new RegExp(`^(${Object.keys(KINDS).join("|")}) (?:de|en|del)(?: (?:el|la|los|las))? (.+)$`);

/** The diagnosis in English, or null when a word of it is not one the tables know. */
function diagnosis(text: string): string | null {
  const key = clean(text);
  if (WHOLE[key]) return WHOLE[key]!;
  const found = key.match(KIND_AND_PART);
  const part = found && PARTS[found[2]!];
  return found && part ? `${part} ${KINDS[found[1]!]}` : null;
}

// ---------------------------------------------------------------------------------------------------- the dates
const day = (year: number, month: number, date: number) => Date.UTC(year, month, date);
const endOfMonth = (year: number, month: number) => day(year, month + 1, 0);

const madridToday = (now: Date) => {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now).split("-").map(Number);
  return { year: y!, month: m! - 1, date: d!, at: day(y!, m! - 1, d!) };
};

/** The day he began missing games, as a date no later than today: "Desde 12/09" is this year's, or last year's when that has not come yet. */
function startedOn(since: string | undefined, today: ReturnType<typeof madridToday>): number | null {
  const found = since?.match(/^Desde (\d{1,2})\/(\d{1,2})/i);
  if (!found) return null;
  const [date, month] = [Number(found[1]), Number(found[2]) - 1];
  const thisYear = day(today.year, month, date);
  return thisYear <= today.at ? thisYear : day(today.year - 1, month, date);
}

type Return = { label: string; end: (year: number) => number; year: number | null };

/** What "Baja hasta ..." says: how to write the return and when it ends, in the year the site gives or the one it must mean. */
function returnOf(text: string): Return | null {
  const lower = clean(text).replace(/^a /, "");
  const month = (name: string) => SPANISH_MONTHS[name]!;
  const yearOf = (digits: string | undefined) => (digits ? Number(digits) : null);
  const withYear = (label: string, year: number | null) => (year === null ? label : `${label} ${year}`);

  let found = lower.match(new RegExp(`^(?:el )?(\\d{1,2}) de (${MONTH_NAMES})(?: (\\d{4}))?$`));
  if (found) {
    const [date, m, year] = [Number(found[1]), month(found[2]!), yearOf(found[3])];
    return { label: withYear(`${date} ${MONTHS[m]}`, year), end: (y) => day(y, m, date), year };
  }
  found = lower.match(new RegExp(`^(principios|princpios|mediados|finales) de (${MONTH_NAMES})(?: (\\d{4}))?$`));
  if (found) {
    const [part, m, year] = [found[1]!, month(found[2]!), yearOf(found[3])];
    const early = part === "principios" || part === "princpios";
    const mid = part === "mediados";
    const label = early ? `early ${MONTHS[m]}` : mid ? `mid-${MONTHS[m]}` : `late ${MONTHS[m]}`;
    return { label: withYear(label, year), end: (y) => (early ? day(y, m, 10) : mid ? day(y, m, 20) : endOfMonth(y, m)), year };
  }
  found = lower.match(new RegExp(`^(${MONTH_NAMES})-(${MONTH_NAMES})(?: (\\d{4}))?$`));
  if (found) {
    const [from, to, year] = [month(found[1]!), month(found[2]!), yearOf(found[3])];
    return { label: withYear(`${MONTHS[from]}–${MONTHS[to]}`, year), end: (y) => endOfMonth(y, to), year };
  }
  found = lower.match(new RegExp(`^(${MONTH_NAMES})(?: (\\d{4}))?$`));
  if (found) {
    const [m, year] = [month(found[1]!), yearOf(found[2])];
    return { label: withYear(MONTHS[m]!, year), end: (y) => endOfMonth(y, m), year };
  }
  return null;
}

/**
 * Whether the return he was given has gone by. A year the site writes is taken as it is; without one the return is the first
 * such date on or after the day he began missing games (April after a September injury is next April), or after today when
 * the site does not say when it began.
 */
function gone(back: Return, started: number | null, today: ReturnType<typeof madridToday>): boolean {
  const anchor = started ?? today.at;
  let year = back.year ?? new Date(anchor).getUTCFullYear();
  if (back.year === null && back.end(year) < anchor) year += 1;
  return back.end(year) < today.at;
}

// --------------------------------------------------------------------------------------------------- the whole line
export type AbsenceText = {
  cause?: string;
  /** The cause is the site's own words, not translated. */
  causeFf?: true;
  since?: string;
  note?: string;
  /** The note is the site's own words, not translated. */
  noteFf?: true;
};

/**
 * The words the site writes beside an injury or a ban ("Desde 12/09 (18 días)", "Duda para la jornada 8", "Baja hasta
 * octubre"), in English where the pattern is known, and an "until" that has gone by as "Was due back ...". Anything else is
 * shown as the site wrote it and flagged.
 */
export function absenceText(
  entry: { name: string; kind: PlayerKind; cause?: string; since?: string; note?: string },
  round: number | null = null,
  now: Date = new Date(),
): AbsenceText {
  const out: AbsenceText = {};
  const today = madridToday(now);
  if (entry.cause) {
    const english = diagnosis(entry.cause);
    out.cause = english ?? entry.cause;
    if (!english) out.causeFf = true;
  }
  if (entry.since) {
    const date = entry.since.match(/^Desde (\d{1,2})\/(\d{1,2})/i);
    out.since = date ? `since ${Number(date[1])} ${SHORT_MONTHS[Number(date[2]) - 1] ?? date[2]}` : entry.since;
  }
  if (entry.note) {
    const text = note(entry.note, entry.since, today);
    out.note = text ?? entry.note;
    if (!text) out.noteFf = true;
  } else if (entry.kind === "suspended") {
    out.note = round !== null ? `Misses round ${round}` : "Suspended";
  }
  return out;
}

function note(text: string, since: string | undefined, today: ReturnType<typeof madridToday>): string | null {
  const round = (pattern: RegExp, words: string) => {
    const found = text.match(pattern);
    return found ? `${words} ${found[1]}` : null;
  };
  const said =
    round(/^Duda para la jornada (\d+)/i, "Doubt for round") ??
    round(/^Disponible para la jornada (\d+)/i, "Available for round") ??
    round(/^Baja confirmada para la jornada (\d+)/i, "Out for round");
  if (said) return said;
  const until = text.match(/^Baja hasta (.+)$/i);
  const back = until && returnOf(until[1]!);
  if (!back) return null;
  return gone(back, startedOn(since, today), today) ? `Was due back ${back.label}` : `Out until ${back.label}`;
}
