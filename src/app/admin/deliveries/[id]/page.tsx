import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { DeliveryNote } from "@/components/delivery-note";
import { Button, Field, Input } from "@/components/form";
import { PrintButton } from "@/components/print-button";
import { requireAdmin } from "@/lib/auth";
import { getDeliveryForViewer } from "@/lib/logistics";
import { cancelDelivery, confirmDelivery, unconfirmDelivery } from "../actions";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "תעודת משלוח" };

const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

async function AdminDelivery({ params }: PageProps<"/admin/deliveries/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const result = await getDeliveryForViewer(id, admin);
  if (!result) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href="/admin/deliveries" className="text-sm text-brand hover:underline">
          למסירות
        </Link>
        <PrintButton />
      </div>

      <DeliveryNote {...result} />

      {result.delivery.status === "delivered" && (
        <ActionForm action={unconfirmDelivery} className="flex flex-col gap-2 card-surface p-4 print:hidden">
          <p className="text-sm text-muted">אושרה בטעות? ביטול האישור פותח את התעודה שוב, ואז אפשר לאשר אותה מחדש או לבטל אותה.</p>
          <input type="hidden" name="deliveryId" value={result.delivery.id} />
          <Button variant="danger" className="self-start">
            ביטול אישור המסירה
          </Button>
        </ActionForm>
      )}

      {result.delivery.status === "prepared" && (
        <>
          <ActionForm action={confirmDelivery} className="flex flex-col gap-3 card-surface p-4 print:hidden">
            <h2 className="font-semibold">אישור מסירה</h2>
            <input type="hidden" name="deliveryId" value={result.delivery.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="שם המקבל" name="recipientName">
                <Input name="recipientName" required maxLength={100} />
              </Field>
              <Field label="תאריך" name="deliveredAt">
                <Input name="deliveredAt" type="date" lang="he-IL" required defaultValue={isoDay.format(new Date())} />
              </Field>
            </div>
            <Field label="אסמכתא (מספר שילוח, הערה)" name="proofNote">
              <Input name="proofNote" maxLength={500} />
            </Field>
            <Button className="self-start">סימון כנמסר</Button>
          </ActionForm>
          <ActionForm action={cancelDelivery} className="print:hidden">
            <input type="hidden" name="deliveryId" value={result.delivery.id} />
            <Button variant="danger">ביטול התעודה</Button>
          </ActionForm>
        </>
      )}
    </div>
  );
}

export default function AdminDeliveryPage(props: PageProps<"/admin/deliveries/[id]">) {
  return (
    <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
      <AdminDelivery {...props} />
    </Suspense>
  );
}
