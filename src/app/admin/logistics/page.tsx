import { redirect } from "next/navigation";

/** Shipments now sit with the vendor orders they belong to (S10A). */
export default function LogisticsPage() {
  redirect("/admin/purchasing#sent");
}
