import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

const notices: Record<string, string> = {
  confirm: "קישור האימות אינו תקף או שפג תוקפו. התחברו או הירשמו מחדש.",
};

async function LoginContent({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <LoginForm
      next={typeof next === "string" ? next : undefined}
      notice={typeof error === "string" ? notices[error] : undefined}
    />
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-bold">כניסה</h1>
      <div className="rounded-lg border border-line bg-surface p-6">
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
