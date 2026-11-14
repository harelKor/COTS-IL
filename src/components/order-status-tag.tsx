import { StatusTag, type Tone } from "@/components/form";
import {
  lineLabel,
  SHIPMENT_LABELS,
  SHIPMENT_TONES,
  shipmentStatus,
  statusLabel,
  statusTone,
  type Audience,
  type LineStatus,
  type OrderStatusKey,
  type StatusTone,
} from "@/domain/order-status";

/** The one status palette (D-07), tied to the dictionary's tones in src/domain/order-status.ts. */
export const TONE_TAG: Record<StatusTone, Tone> = {
  neutral: "neutral",
  us: "brand",
  team: "warning",
  done: "success",
  problem: "danger",
};

/** The admin's filter boxes and card edges, in the same five tones. */
export const TONE_BOX: Record<StatusTone, { box: string; edge: string }> = {
  neutral: { box: "bg-subtle text-foreground", edge: "border-slate" },
  us: { box: "bg-brand-soft/60 text-brand-strong", edge: "border-brand" },
  team: { box: "bg-warning/8 text-warning", edge: "border-warning" },
  done: { box: "bg-success/8 text-success", edge: "border-success" },
  problem: { box: "bg-danger/8 text-danger", edge: "border-danger" },
};

/** An order's status in one audience's words and its tone's colour. */
export function OrderStatusTag({ status, audience, pickup = false }: { status: OrderStatusKey; audience: Audience; pickup?: boolean }) {
  return <StatusTag tone={TONE_TAG[statusTone(status)]}>{statusLabel(status, audience, pickup)}</StatusTag>;
}

/** A line's step, same words and colours as the order's. */
export function LineStatusTag({ status, audience, pickup = false }: { status: LineStatus; audience: Audience; pickup?: boolean }) {
  return <StatusTag tone={TONE_TAG[statusTone(status)]}>{lineLabel(status, audience, pickup)}</StatusTag>;
}

/** A supplier shipment's state from its units: received in full closes it (A-03). */
export function ShipmentTag(units: { shipped: number; received: number }) {
  const state = shipmentStatus(units);
  return <StatusTag tone={TONE_TAG[SHIPMENT_TONES[state]]}>{SHIPMENT_LABELS[state]}</StatusTag>;
}
