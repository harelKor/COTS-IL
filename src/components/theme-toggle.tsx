"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemeChoice } from "@/domain/theme";
import { setThemeChoice, useTheme } from "./theme-store";

/**
 * The header's sun/moon switch (from 1024px; below that the account menu has ThemeMenuRow). One
 * press turns the dark theme on or off, and the choice is remembered. Its icon is the theme in
 * effect, shown by the CSS before any script runs (`.only-light`/`.only-dark`).
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const state = useTheme();
  const dark = state?.theme === "dark";
  return (
    <button
      type="button"
      aria-label="מצב כהה"
      aria-pressed={state ? dark : undefined}
      onClick={() => state && setThemeChoice(dark ? "light" : "dark")}
      className={`theme-switch account-chip size-11 shrink-0 items-center justify-center rounded-full border transition-colors ${className}`}
    >
      <Sun size={20} strokeWidth={1.75} aria-hidden className="only-light" />
      <Moon size={20} strokeWidth={1.75} aria-hidden className="only-dark" />
    </button>
  );
}

const OPTIONS: { choice: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { choice: "light", label: "בהיר", Icon: Sun },
  { choice: "dark", label: "כהה", Icon: Moon },
  { choice: null, label: "לפי המכשיר", Icon: Monitor },
];

/** The account/guest menu's row: light, dark, or back to the device's setting. */
export function ThemeMenuRow({ className = "" }: { className?: string }) {
  const state = useTheme();
  return (
    <div role="group" aria-label="מראה האתר" className={`theme-switch flex flex-col gap-1.5 px-3 py-2 ${className}`}>
      <span className="text-caption text-muted">מראה האתר</span>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-subtle p-1">
        {OPTIONS.map(({ choice, label, Icon }) => {
          const on = state ? state.choice === choice : false;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={state ? on : undefined}
              onClick={() => setThemeChoice(choice)}
              className={`flex min-h-11 items-center justify-center gap-1 rounded-lg px-0.5 text-caption font-medium whitespace-nowrap transition-colors ${
                on ? "bg-surface text-foreground shadow-sm ring-1 ring-line" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
