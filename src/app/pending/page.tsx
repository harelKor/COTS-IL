import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TeamStep } from "@/components/cart-panel";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { getBusiness } from "@/lib/settings";
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

  if (team.status === "suspended") {
    return (
      <>
        <p>
          חשבון <TeamName team={team} /> מושהה, ואי אפשר לשלוח ממנו בקשות חדשות.
        </p>
        {team.rejectionReason && <p className="mt-2 text-muted">סיבה: {team.rejectionReason}</p>}
        <p className="mt-2 text-muted">
          ההזמנות הקודמות עדיין כאן:{" "}
          <Link href="/orders" className="inline-flex min-h-11 items-center text-brand hover:underline">
            ההזמנות שלנו
          </Link>
        </p>
      </>
    );
  }

  if (team.status === "rejected") {
    return (
      <>
        <p>
          בקשת ההרשמה של <TeamName team={team} /> לא אושרה.
        </p>
        {team.rejectionReason && <p className="mt-2 text-muted">סיבה: {team.rejectionReason}</p>}
      </>
    );
  }

  const { pendingTeamsMaySend } = await getBusiness();
  return (
    <p>
      <TeamName team={team} /> ממתינה לאישור הספק הישראלי.{" "}
      {pendingTeamsMaySend
        ? "אפשר כבר לבנות סל ולשלוח בקשה ראשונה: היא תיבדק יחד עם הקבוצה."
        : "אפשר כבר לבנות סל, ולשלוח אותו מיד אחרי שהקבוצה תאושר."}
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
