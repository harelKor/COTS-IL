"use server";

import { requireAdmin } from "@/lib/auth";
import type { OrderStatusKey } from "@/domain/order-status";
import { OrderPanel } from "./order-panel";

/**
 * An open card's details, rendered on the server and handed to the card on its first open (or on hover).
 * The card keeps the result, so reopening costs nothing.
 */
export async function loadOrderPanel(orderId: string, status: OrderStatusKey, edit: boolean) {
  await requireAdmin();
  return <OrderPanel orderId={orderId} status={status} edit={edit} />;
}
