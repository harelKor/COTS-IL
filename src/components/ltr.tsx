import type { ReactNode } from "react";

/**
 * Part names, SKUs, units and prices inside Hebrew text. `<bdi>` isolates the
 * run, so "1/2" Hex" or "#10-32" never flips around its neighbours.
 */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}
