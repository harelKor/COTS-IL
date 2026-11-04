import { Suspense } from "react";

async function Email({ searchParams }: PageProps<"/signup/check-email">) {
  const { email } = await searchParams;
  return typeof email === "string" ? <span className="ltr font-medium">{email}</span> : <>שהזנתם</>;
}

export default function CheckEmailPage(props: PageProps<"/signup/check-email">) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-surface p-6">
      <h1 className="mb-3 text-xl font-bold">בדקו את תיבת הדואר</h1>
      <p className="text-muted">
        שלחנו קישור אימות לכתובת{" "}
        <Suspense>
          <Email {...props} />
        </Suspense>
        . לחצו עליו כדי להשלים את ההרשמה. לאחר מכן הבקשה תמתין לאישור הספק הישראלי.
      </p>
    </div>
  );
}
