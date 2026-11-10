import { redirect } from "next/navigation";

/** The order list is now the admin home (S10A). */
export default function AdminOrdersPage() {
  redirect("/admin");
}
