import {
  Activity,
  Bolt,
  Bot,
  Box,
  Car,
  CircleDot,
  Cog,
  Cpu,
  Disc,
  Layers,
  Link2,
  Package,
  Ruler,
  Settings2,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

/** One line icon per catalog category, by the slugs in the categories table. */
const ICONS: Record<string, LucideIcon> = {
  bearings: CircleDot,
  "belts-chain": Link2,
  drivetrain: Car,
  electronics: Cpu,
  fasteners: Bolt,
  gearboxes: Settings2,
  gears: Cog,
  mechanisms: Bot,
  motors: Zap,
  other: Box,
  pneumatics: Wind,
  sensors: Activity,
  shafts: Ruler,
  structure: Layers,
  tools: Wrench,
  wheels: Disc,
};

/** The category's icon on a small tile; a new category gets a generic package icon. */
export function CategoryIcon({ slug }: { slug: string }) {
  const Icon = ICONS[slug] ?? Package;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle text-brand">
      <Icon size={20} strokeWidth={1.75} aria-hidden />
    </span>
  );
}
