import type { ReactNode } from "react";

/**
 * A section heading anchored into the page: an icon badge in the page's brand tint, the title, and
 * a hairline that runs to the far edge (with an optional control after it). The dark pages tint
 * the badge and hairline in the vendor's colours (globals.css, ".section-badge", ".section-rule").
 */
export function SectionHeading({ id, icon, children, aside }: { id?: string; icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 id={id} className="flex min-w-0 items-center gap-2.5 text-section font-semibold tracking-tight lg:text-[24px]">
        {icon && (
          <span aria-hidden className="section-badge flex size-9 shrink-0 items-center justify-center rounded-xl">
            {icon}
          </span>
        )}
        <span className="min-w-0">{children}</span>
      </h2>
      <span aria-hidden className="section-rule h-px min-w-6 flex-1" />
      {aside}
    </div>
  );
}
