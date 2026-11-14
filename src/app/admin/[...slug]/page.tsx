import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";

async function Missing(): Promise<null> {
  await requireAdmin();
  notFound();
}

/** Any address under /admin that no page owns: renders `admin/not-found.tsx`, inside the admin layout, after the admin check. */
export default function AdminCatchAll() {
  return (
    <Suspense>
      <Missing />
    </Suspense>
  );
}
