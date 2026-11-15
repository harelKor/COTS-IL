"use client";

import { useSyncExternalStore } from "react";
import { parseChoice, resolveTheme, THEME_COLOR, THEME_KEY, type Theme, type ThemeChoice } from "@/domain/theme";

/**
 * The theme on the client (LM1). <html data-theme> is the truth (set before paint by THEME_SCRIPT);
 * the switch, the menu and the welcome note read it here and change it with setThemeChoice, which
 * also saves it, keeps the browser's chrome colour in step and tells every reader. Another tab's
 * choice and a change of the device setting are followed too.
 */
const listeners = new Set<() => void>();
const DEVICE_DARK = "(prefers-color-scheme: dark)";

export function themesSupported(): boolean {
  return typeof CSS !== "undefined" && CSS.supports("color", "light-dark(#000, #fff)");
}

function currentChoice(): ThemeChoice {
  return parseChoice(document.documentElement.getAttribute("data-theme"));
}

function currentTheme(): Theme {
  return resolveTheme(currentChoice(), window.matchMedia(DEVICE_DARK).matches, themesSupported());
}

/** The theme-color metas follow the theme in effect; following the device, each gets its own colour back. */
function syncChrome() {
  const choice = currentChoice();
  const theme = currentTheme();
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own: Theme = meta.media.includes("light") ? "light" : "dark";
    meta.content = THEME_COLOR[choice || !themesSupported() ? theme : own];
  }
}

function notify() {
  syncChrome();
  for (const l of listeners) l();
}

function apply(choice: ThemeChoice) {
  if (choice) document.documentElement.setAttribute("data-theme", choice);
  else document.documentElement.removeAttribute("data-theme");
}

/** Saves the visitor's choice (null: follow the device again) and applies it at once. */
export function setThemeChoice(choice: ThemeChoice) {
  apply(choice);
  try {
    if (choice) localStorage.setItem(THEME_KEY, choice);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Storage blocked: the choice holds for this page only.
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia(DEVICE_DARK);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    apply(parseChoice(e.newValue));
    notify();
  };
  media.addEventListener("change", notify);
  window.addEventListener("storage", onStorage);
  if (listeners.size === 1) syncChrome();
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", notify);
    window.removeEventListener("storage", onStorage);
  };
}

type Snapshot = { choice: ThemeChoice; theme: Theme; supported: boolean };
let last: Snapshot | null = null;
function snapshot(): Snapshot {
  const next = { choice: currentChoice(), theme: currentTheme(), supported: themesSupported() };
  if (last && last.choice === next.choice && last.theme === next.theme && last.supported === next.supported) return last;
  last = next;
  return next;
}

/** The choice and the theme in effect; null while the page is prerendered or hydrating (the CSS already shows it right). */
export function useTheme(): Snapshot | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
