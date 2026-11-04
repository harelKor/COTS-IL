import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold">הרשמת קבוצה</h1>
      <p className="mb-6 text-muted">
        לאחר אימות כתובת הדוא״ל, הבקשה תועבר לאישור הספק הישראלי. ניתן יהיה להזמין רק לאחר שהקבוצה אושרה.
      </p>
      <div className="rounded-lg border border-line bg-surface p-6">
        <SignupForm />
      </div>
    </div>
  );
}
