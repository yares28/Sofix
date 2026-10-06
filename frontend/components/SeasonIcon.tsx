/**
 * In season (a star) or Classic (a clock): the marks made for My cards on 25 Sep 2026 (commit 1dcf334), used for cards and
 * for the competitions that ask for them. Decorative: the text beside it (or the card's label) says the same in words.
 */
export default function SeasonIcon({ inSeason, size = 11 }: { inSeason: boolean; size?: number }) {
  return inSeason ? (
    <svg className="season-ic" width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M6 0l1.3 3.5L11 4.7 8.2 7l.9 4L6 9.1 2.9 11l.9-4L1 4.7l3.7-1.2z" fill="currentColor" />
    </svg>
  ) : (
    <svg className="season-ic" width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 3v3l2 1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
