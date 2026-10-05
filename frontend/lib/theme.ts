/** The theme the owner picked (light or dark), kept in this browser; with none saved the system's setting decides. */
export type Theme = "light" | "dark";
export const THEME_KEY = "sofix-theme";

/** Runs before the first paint, so a saved dark theme never flashes white. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** The theme on screen now: the saved one, else the system's. */
export function shownTheme(saved: string | null | undefined, systemDark: boolean): Theme {
  return saved === "light" || saved === "dark" ? saved : systemDark ? "dark" : "light";
}
