"use client";

import { Moon, Sun, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { otherTheme, THEME_WORDS, WELCOME_KEY } from "@/domain/theme";
import { setThemeChoice, themesSupported, useTheme } from "./theme-store";

const SHOW_MS = 8000;
const AGAIN_MS = 4000;
const FADE_MS = 250;

/**
 * The welcome note (LM1, the user's request): once per browser session, on the first page a visitor
 * lands on, a small glass note under the header at the inline end (the top left in this RTL site;
 * across the width on phones) says which theme the site is in, with a button for the other one and
 * a close ×. It fades out by itself after about 8 seconds unless the pointer or focus is on it.
 * role="status", so it's announced without taking focus.
 */
export function ThemeWelcome() {
  const state = useTheme();
  const [phase, setPhase] = useState<"off" | "on" | "leaving">("off");
  const [top, setTop] = useState(64);
  const timer = useRef<number | undefined>(undefined);

  const leave = () => {
    window.clearTimeout(timer.current);
    setPhase((p) => (p === "on" ? "leaving" : p));
    timer.current = window.setTimeout(() => setPhase("off"), FADE_MS);
  };
  const wait = (ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(leave, ms);
  };

  useEffect(() => {
    if (!themesSupported()) return;
    try {
      if (sessionStorage.getItem(WELCOME_KEY)) return;
    } catch {
      // No session storage: it could show on every page, so it doesn't show at all.
      return;
    }
    // Under the header (and the announcement banner above it, while it's on screen).
    const place = () => setTop(Math.round((document.querySelector("header.site-header")?.getBoundingClientRect().bottom ?? 52) + 10));
    const frame = requestAnimationFrame(() => {
      // Marked as seen only once it shows (an effect that is set up twice cancels the first frame).
      try {
        sessionStorage.setItem(WELCOME_KEY, "1");
      } catch {}
      place();
      setPhase("on");
      wait(SHOW_MS);
    });
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place);
      window.clearTimeout(timer.current);
    };
    // Once, on the first page; the layout keeps this component across client navigations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "off" || !state) return null;
  const words = THEME_WORDS[state.theme];
  const other = otherTheme(state.theme);
  const Icon = state.theme === "dark" ? Moon : Sun;
  return (
    <div
      role="status"
      data-leaving={phase === "leaving" || undefined}
      style={{ top }}
      onPointerEnter={() => window.clearTimeout(timer.current)}
      onPointerLeave={() => wait(AGAIN_MS)}
      onFocus={() => window.clearTimeout(timer.current)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) wait(AGAIN_MS);
      }}
      className="theme-welcome fixed inset-x-3 z-40 flex items-center gap-3 rounded-2xl bg-glass py-2 ps-3 pe-1 text-foreground shadow-lift ring-1 ring-line backdrop-blur-xl sm:inset-x-auto sm:end-4 sm:w-[340px] print:hidden"
    >
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <p className="text-callout font-semibold">{words.mode}</p>
        <button
          type="button"
          onClick={() => {
            setThemeChoice(other);
            leave();
          }}
          className="-ms-2 flex min-h-11 items-center gap-1.5 rounded-full px-2 text-callout font-medium text-brand hover:bg-subtle"
        >
          {other === "dark" ? <Moon size={16} strokeWidth={1.75} aria-hidden /> : <Sun size={16} strokeWidth={1.75} aria-hidden />}
          {THEME_WORDS[other].to}
        </button>
      </div>
      <button type="button" aria-label="סגירה" onClick={leave} className="flex size-11 shrink-0 items-center justify-center self-start rounded-full text-muted hover:bg-subtle hover:text-foreground">
        <X size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
