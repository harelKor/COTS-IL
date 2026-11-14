import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("כתובת דוא״ל לא תקינה")),
  password: z.string().min(1, "יש להזין סיסמה"),
});

const PROBE_ORIGIN = "https://same-origin.invalid";

/**
 * Only allow same-site relative redirects after sign-in. Browsers strip tabs and
 * newlines from URLs and treat "\" like "/", so "/\t/evil.com" would become
 * "//evil.com": reject control characters and backslashes, then resolve the path
 * and require that it stays on our own origin.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  try {
    return new URL(next, PROBE_ORIGIN).origin === PROBE_ORIGIN ? next : "/";
  } catch {
    return "/";
  }
}

/** Shape returned by form server actions to `useActionState`. */
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

export function formValues(formData: FormData, omit: string[] = []): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !omit.includes(key) && !key.startsWith("$")) values[key] = value;
  }
  return values;
}
