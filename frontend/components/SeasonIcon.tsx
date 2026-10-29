import { useId } from "react";

/**
 * Sorare's own In-season ("27", in its gradient) and Classic ("C") badges, as sorare.com draws them for football (its season icon,
 * read from its app on 29 Oct 2026). `size` is the height. Decorative: the text beside it (or the card's label) says the same in words.
 */
export default function SeasonIcon({ inSeason, size = 11 }: { inSeason: boolean; size?: number }) {
  const id = useId();
  return inSeason ? (
    <svg className="season-ic" height={size} width={(size * 24.2148) / 15.4062} viewBox="0 0 24.2148 15.4062" aria-hidden="true">
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="-0.4229" y1="14.3909" x2="51.4242" y2="17.6092">
        <stop offset="0" stopColor="#F8D3DA" />
        <stop offset="0.2832" stopColor="#B3A9F4" />
        <stop offset="0.5401" stopColor="#FBE9FB" />
        <stop offset="1" stopColor="#4F94FD" />
      </linearGradient>
      <path
        d="M24.2148 11.7764L19.7725 15.4062H0V3.63867L3.83301 0H24.2148V11.7764ZM8.9375 1.48047C6.7968 1.48047 5.91423 2.16677 5.91406 3.73535V5.51758H7.59766V2.83691H10.2773V6.1709L5.91406 9.27637V13.5088H11.9609V12.2178H7.59766V9.92969L11.9609 6.80859V3.73535C11.9608 2.16682 11.078 1.48051 8.9375 1.48047ZM13.2236 1.5791V2.88672H17.2109L14.2041 13.5088H15.9688L18.9922 2.88672V1.5791H13.2236Z"
        fill={`url(#${id})`}
      />
    </svg>
  ) : (
    <svg className="season-ic" height={size} width={(size * 330) / 232} viewBox="0 0 330 232" aria-hidden="true">
      <path
        d="M347.358 177.689L280.323 232.448H-18V54.904L39.8281 0H347.358V177.689ZM164.903 29C132.722 29 120.154 39.1008 120.154 60.829V171.469C120.154 193.197 132.722 203.299 164.903 203.299C197.085 203.299 209.535 193.197 209.535 171.469V136.703H185.223V183.684H144.467V48.4971H185.223V95.243H209.535V60.829C209.535 39.1008 197.085 29 164.903 29Z"
        fill="currentColor"
      />
    </svg>
  );
}
