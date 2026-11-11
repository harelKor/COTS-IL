import Link from "next/link";
import { Suspense } from "react";
import { SignInStep } from "@/components/cart-panel";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { safeNext } from "@/lib/validation";
import { LoginForm } from "./login-form";

const notices: Record<string, string> = {
  confirm: "הקישור לא עבד: אולי פג תוקפו או שכבר נעשה בו שימוש. הזינו את הכתובת ונשלח קוד חדש, הסל מחכה.",
  google: "הכניסה עם Google לא הצליחה. נסו שוב או היכנסו בקישור לדוא״ל.",
};

async function LoginContent({ searchParams }: PageProps<"/login">) {
  const [{ next, error }, google] = await Promise.all([searchParams, googleSignInEnabled()]);
  const to = typeof next === "string" ? next : undefined;
  return (
    <div className="flex flex-col gap-6">
      {typeof error === "string" && notices[error] && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">{notices[error]}</p>}
      <SignInStep google={google} next={safeNext(to)} intro="בלי סיסמה: נשלח לכם קוד כניסה לדוא״ל." />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">כניסה עם סיסמה</summary>
        <div className="mt-4">
          <LoginForm next={to} />
        </div>
      </details>
    </div>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-title font-semibold">כניסה</h1>
      <div className="card-surface p-6">
        <Suspense>
          <LoginContent {...props} />
        </Suspense>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        קבוצה חדשה?{" "}
        <Link href="/signup" className="text-brand hover:underline">
          הרשמת קבוצה
        </Link>
      </p>
    </div>
  );
}
