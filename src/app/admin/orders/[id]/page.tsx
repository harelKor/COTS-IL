import { redirect } from "next/navigation";
import { Suspense } from "react";

async function Redirect({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  redirect(`/admin?open=${encodeURIComponent(id)}`);
  return null;
}

/** Old links to an order open its card on the all-orders page (S10A). */
export default function AdminOrderPage(props: PageProps<"/admin/orders/[id]">) {
  return (
    <Suspense>
      <Redirect {...props} />
    </Suspense>
  );
}
