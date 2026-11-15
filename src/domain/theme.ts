/**
 * The site's two themes (LM1, Nov 15, 2026; docs/LIGHT-MODE-PLAN.md). The theme lives only on
 * <html>: with no saved choice the CSS follows the device (`color-scheme: light dark`); a choice
 * from the sun/moon switch is saved in localStorage and set as <html data-theme> before paint by
 * THEME_SCRIPT. No cookie and no server read, so every page stays prerendered.
 */
export type Theme = "light" | "dark";
/** null: follow the device. */
export type ThemeChoice = Theme | null;

export const THEME_KEY = "cots-theme";
/** sessionStorage: the welcome note has been shown in this browser session. */
export const WELCOME_KEY = "cots-theme-welcome";

/** The browser's chrome colour per theme (the pearl canvas, the midnight one). */
export const THEME_COLOR: Record<Theme, string> = { light: "#f6f7ff", dark: "#020416" };

/** A saved value as a choice; anything else (nothing saved, a stale value) follows the device. */
export function parseChoice(value: unknown): ThemeChoice {
  return value === "light" || value === "dark" ? value : null;
}

/**
 * The theme in effect. A browser without CSS light-dark() only has the dark site (globals.css keeps
 * the dark tokens for it), whatever was chosen.
 */
export function resolveTheme(choice: ThemeChoice, deviceDark: boolean, supported = true): Theme {
  if (!supported) return "dark";
  return choice ?? (deviceDark ? "dark" : "light");
}

/** The other theme, for the switch and the welcome note's button. */
export const otherTheme = (theme: Theme): Theme => (theme === "dark" ? "light" : "dark");

/** Hebrew words for each theme: the note's sentence and its button. */
export const THEME_WORDS: Record<Theme, { mode: string; to: string }> = {
  light: { mode: "האתר במצב בהיר", to: "למצב בהיר" },
  dark: { mode: "האתר במצב כהה", to: "למצב כהה" },
};

/**
 * Runs in <head> before the first paint (layout.tsx): the saved choice onto <html data-theme>. In
 * try/catch, since storage can be blocked; then the device setting simply applies.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
