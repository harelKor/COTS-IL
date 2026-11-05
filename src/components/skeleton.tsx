/** Placeholders shown while a page streams in, in place of a "loading" text. */

export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-2">
          <div className="skeleton aspect-square w-full rounded-card" />
          <div className="skeleton h-3 w-1/3" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-1/4" />
        </li>
      ))}
    </ul>
  );
}

export function TileGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="skeleton h-20 rounded-card" />
      ))}
    </ul>
  );
}

export function ProductSkeleton() {
  return (
    <div className="grid gap-8 md:grid-cols-2" aria-hidden>
      <div className="skeleton aspect-square w-full rounded-card" />
      <div className="flex flex-col gap-3">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-8 w-4/5" />
        <div className="skeleton h-6 w-28" />
        <div className="skeleton mt-4 h-48 w-full rounded-card" />
      </div>
    </div>
  );
}

/** For tables and forms: a heading bar and a few rows. */
export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="skeleton h-7 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-12 w-full" />
      ))}
    </div>
  );
}

/** Announces the wait to screen readers, which can't see the shimmer. */
export function Loading({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען</span>
      {children}
    </div>
  );
}
