import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { DeliveryNote } from "@/components/delivery-note";
import { PrintButton } from "@/components/print-button";
import { getViewer } from "@/lib/auth";
import { getDeliveryForViewer } from "@/lib/logistics";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "תעודת משלוח" };

async function Delivery({ params }: PageProps<"/deliveries/[id]">) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/deliveries/${encodeURIComponent(id)}`);
  const result = await getDeliveryForViewer(id, viewer);
  if (!result) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <DeliveryNote {...result} />
    </div>
  );
}

export default function DeliveryPage(props: PageProps<"/deliveries/[id]">) {
  return (
    <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
      <Delivery {...props} />
    </Suspense>
  );
}
