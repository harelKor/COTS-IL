import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getViewer } from "@/lib/auth";

async function PendingStatus() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.isAdmin || viewer.teams.some((t) => t.status === "active")) redirect("/");

  const team = viewer.teams[0];
  if (!team) {
    return <p className="text-muted">החשבון שלכם אינו משויך לקבוצה. בקשו ממנהל הקבוצה להזמין אתכם.</p>;
  }

  if (team.status === "rejected" || team.status === "suspended") {
    return (
      <>
        <p>
          בקשת ההרשמה של {team.name} (<span className="ltr">{`${team.program} ${team.number}`}</span>) לא אושרה.
        </p>
        {team.rejectionReason && <p className="mt-2 text-muted">סיבה: {team.rejectionReason}</p>}
      </>
    );
  }

  return (
    <p>
      בקשת ההרשמה של {team.name} (<span className="ltr">{`${team.program} ${team.number}`}</span>) ממתינה לאישור
      הספק הישראלי. נעדכן אתכם בדוא״ל ברגע שהקבוצה תאושר.
    </p>
  );
}

export default function PendingPage() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-surface p-6">
      <h1 className="mb-3 text-xl font-bold">ממתין לאישור</h1>
      <Suspense fallback={<p className="text-muted">טוען…</p>}>
        <PendingStatus />
      </Suspense>
    </div>
  );
}
