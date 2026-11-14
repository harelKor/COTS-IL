import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TeamStep } from "@/components/cart-panel";
import { getViewer } from "@/lib/auth";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { TeamName } from "@/components/team-name";

export const metadata: Metadata = { title: "אישור הקבוצה" };

async function PendingStatus() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.isAdmin || viewer.teams.some((t) => t.status === "active")) redirect("/");

  const team = viewer.teams[0];
  if (!team) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted">החשבון עוד לא משויך לקבוצה. קבוצה חדשה? צרו אותה כאן. הקבוצה כבר רשומה? בקשו ממי שרשם/ה אותה להוסיף את הכתובת שלכם.</p>
        <TeamStep />
      </div>
    );
  }

  if (team.status === "rejected" || team.status === "suspended") {
    return (
      <>
        <p>
          בקשת ההרשמה של <TeamName team={team} /> לא אושרה.
        </p>
        {team.rejectionReason && <p className="mt-2 text-muted">סיבה: {team.rejectionReason}</p>}
      </>
    );
  }

  return (
    <p>
      <TeamName team={team} /> ממתינה לאישור הספק הישראלי. אפשר כבר
      לבנות סל ולשלוח בקשה ראשונה: היא תיבדק יחד עם הקבוצה.
    </p>
  );
}

export default function PendingPage() {
  return (
    <div className="mx-auto max-w-md card-surface p-6">
      <h1 className="mb-3 text-xl font-semibold">ממתין לאישור</h1>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <PendingStatus />
      </Suspense>
    </div>
  );
}
