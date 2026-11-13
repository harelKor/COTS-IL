import { Suspense } from "react";
import { SECTIONS } from "./sections";
import { SettingsNav } from "./settings-nav";

/** "הגדרות" (S16): run the site from here instead of from code. */
export default function SettingsLayout({ children }: LayoutProps<"/admin/settings">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-semibold tracking-tight">הגדרות</h1>
        {/* The path is request data, so the active section waits in Suspense. */}
        <Suspense
          fallback={
            <ul className="flex flex-wrap gap-2" aria-hidden>
              {SECTIONS.map((s) => (
                <li key={s.label} className="min-h-11 rounded-full border border-line px-4 py-2.5 text-callout text-muted">
                  {s.label}
                </li>
              ))}
            </ul>
          }
        >
          <SettingsNav />
        </Suspense>
      </div>
      {children}
    </div>
  );
}
