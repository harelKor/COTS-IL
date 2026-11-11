import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInStep, TeamStep } from "@/components/cart-panel";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { getViewer } from "@/lib/auth";
import { googleSignInEnabled } from "@/lib/auth-providers";

export const metadata: Metadata = { title: "הרשמת קבוצה" };

/** The same two steps as the cart sheet: an email code (or Google), then the team. */
async function Steps() {
  const [viewer, google] = await Promise.all([getViewer(), googleSignInEnabled()]);
  if (viewer && (viewer.isAdmin || viewer.teams.length > 0)) redirect("/catalog");
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex gap-2 text-caption" aria-label="שלבים">
        <li className={`rounded-md px-2 py-0.5 ${viewer ? "bg-subtle text-muted" : "bg-brand-soft font-medium text-brand"}`}>1. דוא״ל</li>
        <li className={`rounded-md px-2 py-0.5 ${viewer ? "bg-brand-soft font-medium text-brand" : "bg-subtle text-muted"}`}>2. הקבוצה</li>
      </ol>
      {viewer ? <TeamStep /> : <SignInStep google={google} next="/signup" intro="בלי סיסמה: נשלח לכם קוד לדוא״ל, ואחריו פרטי הקבוצה." />}
    </div>
  );
}

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-title font-semibold">הרשמת קבוצה</h1>
      <p className="mb-6 text-muted">אפשר לבנות סל ולשלוח בקשה ראשונה מיד. הספק הישראלי יאשר את הקבוצה יחד איתה.</p>
      <div className="card-surface p-6">
        <Suspense fallback={<Loading><PageSkeleton rows={3} /></Loading>}>
          <Steps />
        </Suspense>
      </div>
    </div>
  );
}
