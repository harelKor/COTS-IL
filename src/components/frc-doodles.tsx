import { BatteryFull, Bolt, Cable, Camera, Cpu, Disc3, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The home page's backdrop: soft colour washes and small robotics line drawings (gears, hex bolts,
 * wheels, a robot, a swerve module, a bumper, a hex shaft) scattered over the empty space, low
 * contrast, behind everything and hidden from assistive tech. Our own drawings, no FIRST marks.
 * A fixed layer, so it fills the wide margins on big screens and never adds a scrollbar; each shape
 * drifts slowly (gears and wheels turn), and nothing moves under prefers-reduced-motion.
 */

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const SHAPES: Record<string, ReactNode> = {
  // Teeth from a dashed thick ring (8 teeth), the gear's rim and its hub.
  gear: (
    <>
      <circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="5.3 7.27" />
      <circle cx="24" cy="24" r="12.5" {...stroke} />
      <circle cx="24" cy="24" r="4" {...stroke} />
    </>
  ),
  hexBolt: (
    <>
      <path d="M24 6 39.6 15v18L24 42 8.4 33V15Z" {...stroke} />
      <circle cx="24" cy="24" r="7" {...stroke} />
    </>
  ),
  wheel: (
    <>
      <circle cx="24" cy="24" r="19" {...stroke} />
      <circle cx="24" cy="24" r="14" {...stroke} strokeDasharray="2 3" />
      <path d="M21 21h6v6h-6z" {...stroke} />
      <path d="M24 10v7M24 31v7M10 24h7M31 24h7" {...stroke} />
    </>
  ),
  robot: (
    <>
      <path d="M24 4v5" {...stroke} />
      <circle cx="24" cy="3.5" r="1.5" {...stroke} />
      <rect x="15" y="9" width="18" height="11" rx="3" {...stroke} />
      <circle cx="20.5" cy="14.5" r="1.5" {...stroke} />
      <circle cx="27.5" cy="14.5" r="1.5" {...stroke} />
      <rect x="10" y="22" width="28" height="16" rx="3" {...stroke} />
      <path d="M17 27h14M17 32h8" {...stroke} />
      <circle cx="15" cy="42" r="3.5" {...stroke} />
      <circle cx="33" cy="42" r="3.5" {...stroke} />
    </>
  ),
  swerve: (
    <>
      <rect x="7" y="7" width="34" height="34" rx="7" {...stroke} />
      <rect x="19" y="13" width="10" height="22" rx="4" {...stroke} />
      <path d="M12 24a12 12 0 0 1 4-9M36 24a12 12 0 0 1-4 9" {...stroke} />
      <path d="m14.5 13.5 1.5 1.5-2 1M33.5 34.5 32 33l2-1" {...stroke} />
    </>
  ),
  bumper: (
    <>
      <rect x="3" y="16" width="42" height="16" rx="7" {...stroke} />
      <path d="M12 16v16M36 16v16" {...stroke} />
      <path d="M17 24h14" {...stroke} strokeDasharray="2 2.5" />
    </>
  ),
  shaft: (
    <>
      <path d="M6 30 34 8l4 2v4L10 36l-4-2Z" {...stroke} />
      <path d="M34 8v4l4 2M6 30v4" {...stroke} />
    </>
  ),
  spark: <path d="M24 10v28M10 24h28M15 15l18 18M33 15 15 33" {...stroke} strokeWidth={1.2} />,
};

type Doodle = { shape: keyof typeof SHAPES; top: string; start: string; size: number; tint: string; spin?: boolean; wide?: boolean; d: number };

/** Where each shape sits (% of the viewport), its size and tint; `wide` ones only from 1024px. */
const DOODLES: Doodle[] = [
  { shape: "gear", top: "9%", start: "3%", size: 64, tint: "text-brand/15", spin: true, d: 0 },
  { shape: "hexBolt", top: "24%", start: "91%", size: 40, tint: "text-sky-500/25", d: 2 },
  { shape: "robot", top: "58%", start: "4%", size: 72, tint: "text-brand/12", wide: true, d: 1 },
  { shape: "wheel", top: "78%", start: "88%", size: 60, tint: "text-brand/14", spin: true, d: 3 },
  { shape: "swerve", top: "40%", start: "94%", size: 56, tint: "text-indigo-500/15", wide: true, d: 4 },
  { shape: "bumper", top: "88%", start: "6%", size: 70, tint: "text-red-500/12", wide: true, d: 2.5 },
  { shape: "shaft", top: "14%", start: "82%", size: 44, tint: "text-brand/14", wide: true, d: 1.5 },
  { shape: "gear", top: "68%", start: "93%", size: 36, tint: "text-sky-500/25", spin: true, wide: true, d: 5 },
  { shape: "spark", top: "33%", start: "8%", size: 22, tint: "text-sky-500/35", wide: true, d: 0.5 },
  { shape: "spark", top: "52%", start: "86%", size: 18, tint: "text-amber-400/40", d: 3.5 },
  { shape: "hexBolt", top: "46%", start: "2%", size: 30, tint: "text-brand/15", d: 6 },
  { shape: "spark", top: "6%", start: "70%", size: 16, tint: "text-brand/25", wide: true, d: 4.5 },
];

/** Product line icons that drift slowly across the empty space, in Orbit's blue and purple. */
const PARTS: { icon: LucideIcon; top: string; start: string; size: number; tint: string; dur: number; delay: number; wide?: boolean }[] = [
  { icon: Cpu, top: "18%", start: "12%", size: 26, tint: "text-orbit-blue/25", dur: 70, delay: -10 },
  { icon: BatteryFull, top: "36%", start: "78%", size: 24, tint: "text-orbit-purple/30", dur: 85, delay: -30, wide: true },
  { icon: Bolt, top: "62%", start: "20%", size: 22, tint: "text-brand/25", dur: 64, delay: -5 },
  { icon: Disc3, top: "74%", start: "70%", size: 28, tint: "text-orbit-blue/22", dur: 90, delay: -50, wide: true },
  { icon: Cable, top: "48%", start: "48%", size: 24, tint: "text-orbit-purple/25", dur: 76, delay: -20, wide: true },
  { icon: Wrench, top: "86%", start: "40%", size: 22, tint: "text-brand/22", dur: 68, delay: -40 },
  { icon: Camera, top: "28%", start: "35%", size: 22, tint: "text-orbit-blue/22", dur: 80, delay: -60, wide: true },
];

export function FrcDoodles() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Colour washes: cobalt, sky and a touch of warm, blurred far out. */}
      <div className="doodle-wash absolute -top-24 start-[-10%] size-[420px] rounded-full bg-sky-300/25 blur-3xl" />
      <div className="doodle-wash absolute top-[35%] end-[-12%] size-[480px] rounded-full bg-brand/10 blur-3xl [animation-delay:-6s]" />
      <div className="doodle-wash absolute bottom-[-10%] start-[15%] size-[380px] rounded-full bg-amber-200/20 blur-3xl [animation-delay:-12s]" />
      {/* Orbit 1690: a hint of its LED purple and bumper blue. */}
      <div className="doodle-wash absolute top-[55%] start-[-8%] size-[360px] rounded-full bg-orbit-purple/10 blur-3xl [animation-delay:-3s]" />
      <div className="doodle-wash absolute bottom-[5%] end-[5%] size-[340px] rounded-full bg-orbit-blue/16 blur-3xl [animation-delay:-9s]" />
      <div className="doodle-wash absolute top-[18%] end-[-6%] size-[420px] rounded-full bg-orbit-blue/12 blur-3xl [animation-delay:-14s]" />
      {PARTS.map(({ icon: Icon, ...p }, i) => (
        <span
          key={`p${i}`}
          style={{ top: p.top, insetInlineStart: p.start, "--dur": `${p.dur}s`, "--delay": `${p.delay}s` } as React.CSSProperties}
          className={`part-float absolute ${p.tint} ${p.wide ? "hidden lg:block" : ""}`}
        >
          <Icon size={p.size} strokeWidth={1.5} />
        </span>
      ))}
      {DOODLES.map((d, i) => (
        <svg
          key={i}
          viewBox="0 0 48 48"
          width={d.size}
          height={d.size}
          style={{ top: d.top, insetInlineStart: d.start, animationDelay: `-${d.d * 2}s` } as React.CSSProperties}
          className={`absolute ${d.tint} ${d.spin ? "doodle-spin" : "doodle-drift"} ${d.wide ? "hidden lg:block" : ""}`}
        >
          {SHAPES[d.shape]}
        </svg>
      ))}
    </div>
  );
}
