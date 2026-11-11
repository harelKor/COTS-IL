"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { showToast } from "./toast";

/** Chromium's install prompt event, which TypeScript's DOM types don't include. */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

declare global {
  interface Window {
    /** Kept by the inline script in layout.tsx, since the event can fire before this component loads. */
    __installPrompt?: InstallPromptEvent | null;
  }
}

function subscribe(onChange: () => void) {
  const standalone = window.matchMedia("(display-mode: standalone)");
  window.addEventListener("installprompt:change", onChange);
  standalone.addEventListener("change", onChange);
  return () => {
    window.removeEventListener("installprompt:change", onChange);
    standalone.removeEventListener("change", onChange);
  };
}

/** True when the site is already running as the installed app. */
function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * "Install the app": one tap shows the browser's own install dialog where there is one
 * (Chrome, Edge, Samsung Internet), and puts the app on the home screen or desktop.
 * Safari has no such dialog, so on iPhone and iPad the tap shows the two steps instead.
 * Hidden inside the installed app.
 */
export function InstallAppButton({ variant = "pill" }: { variant?: "pill" | "menu" }) {
  // Counts as installed until hydrated, so the button never flashes inside the installed app.
  const installed = useSyncExternalStore(subscribe, isInstalled, () => true);
  const prompt = useSyncExternalStore(subscribe, () => window.__installPrompt ?? null, () => null);
  const [help, setHelp] = useState<"apple" | "other" | null>(null);

  useEffect(() => {
    const done = () => showToast("האפליקציה הותקנה");
    window.addEventListener("appinstalled", done);
    return () => window.removeEventListener("appinstalled", done);
  }, []);

  if (installed) return null;

  async function install() {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // A prompt can be shown only once; the browser sends a new one if it's still installable.
      window.__installPrompt = null;
      window.dispatchEvent(new Event("installprompt:change"));
      if (outcome === "dismissed") setHelp(null);
      return;
    }
    setHelp((h) => (h ? null : isApple() ? "apple" : "other"));
  }

  return (
    <div className={variant === "menu" ? "flex flex-col gap-2" : "flex flex-col items-center gap-3"}>
      <button
        type="button"
        onClick={install}
        aria-expanded={prompt ? undefined : help !== null}
        className={
          variant === "menu"
            ? "flex h-11 w-full items-center gap-2 rounded-lg px-3 text-start hover:bg-subtle"
            : "btn-soft flex h-11 items-center gap-2 rounded-full px-5 text-callout font-medium text-brand"
        }
      >
        <Download size={variant === "menu" ? 18 : 20} strokeWidth={1.75} aria-hidden />
        התקנת אפליקציה
      </button>

      {help && (
        <div className={`relative w-full max-w-sm p-4 pe-12 text-start text-callout ${variant === "menu" ? "rounded-xl bg-subtle" : "card-surface"}`} role="status">
          <button
            type="button"
            onClick={() => setHelp(null)}
            aria-label="סגירה"
            className="absolute end-1 top-1 flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <X size={18} aria-hidden />
          </button>
          {help === "apple" ? (
            <ol className="flex flex-col gap-2">
              <li className="flex items-center gap-2">
                <span className="text-muted">1.</span> מקישים על
                <Share size={18} strokeWidth={1.75} className="text-brand" aria-label="שיתוף" />
                <span className="font-medium">שיתוף</span> בסרגל הדפדפן
              </li>
              <li className="flex items-center gap-2">
                <span className="text-muted">2.</span> בוחרים
                <SquarePlus size={18} strokeWidth={1.75} className="text-brand" aria-hidden />
                <span className="font-medium">הוספה למסך הבית</span>
              </li>
            </ol>
          ) : (
            <p>
              פותחים את תפריט הדפדפן ובוחרים <span className="font-medium">התקנת אפליקציה</span> או{" "}
              <span className="font-medium">הוספה למסך הבית</span>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
