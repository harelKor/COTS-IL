import { TONE_BOX } from "@/components/order-status-tag";
import { ORDER_STATUS_KEYS, statusTone, type OrderStatusKey } from "@/domain/order-status";

/** Each status's filter box and card edge, from its tone in the status dictionary (D-07). */
export const STATUS_STYLE = Object.fromEntries(ORDER_STATUS_KEYS.map((s) => [s, TONE_BOX[statusTone(s)]])) as Record<
  OrderStatusKey,
  { box: string; edge: string }
>;
