import { Suspense } from "react";
import { cookies } from "next/headers";
import { SIGNUP_EMAIL_COOKIE } from "@/lib/signup-email";

async function Email() {
  // The address travels in a short-lived cookie, never in the URL (history, logs, referrers).
  const email = (await cookies()).get(SIGNUP_EMAIL_COOKIE)?.value;
  return email ? <span className="ltr font-medium">{email}</span> : <>שהזנתם</>;
}

/** Someone invited to a team joins as soon as they confirm. Only a new team waits for approval. */
async function NextStep({ searchParams }: PageProps<"/signup/check-email">) {
  const { invited } = await searchParams;
  return invited ? <>לאחר מכן תצטרפו לקבוצה שהזמינה אתכם.</> : <>לאחר מכן הבקשה תמתין לאישור הספק הישראלי.</>;
}

export default function CheckEmailPage(props: PageProps<"/signup/check-email">) {
  return (
    <div className="mx-auto max-w-md card-surface p-6">
      <h1 className="mb-3 text-xl font-semibold">בדקו את תיבת הדואר</h1>
      <p className="text-muted">
        שלחנו קישור אימות לכתובת{" "}
        <Suspense>
          <Email />
        </Suspense>
        . לחצו עליו כדי להשלים את ההרשמה.{" "}
        <Suspense>
          <NextStep {...props} />
        </Suspense>
      </p>
    </div>
  );
}
