import { z } from "zod";

export const signupSchema = z.object({
  program: z.enum(["FRC", "FTC"], { error: "יש לבחור FRC או FTC" }),
  teamNumber: z.coerce
    .number({ error: "מספר קבוצה לא תקין" })
    .int("מספר קבוצה לא תקין")
    .min(1, "מספר קבוצה לא תקין")
    .max(99999, "מספר קבוצה לא תקין"),
  teamName: z.string().trim().min(2, "יש להזין שם קבוצה"),
  fullName: z.string().trim().min(2, "יש להזין שם איש קשר"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\- ]{7,14}$/, "מספר טלפון לא תקין"),
  email: z.string().trim().toLowerCase().pipe(z.email("כתובת דוא״ל לא תקינה")),
  password: z.string().min(8, "הסיסמה צריכה להכיל לפחות 8 תווים"),
  address: z.string().trim().max(300).optional().default(""),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("כתובת דוא״ל לא תקינה")),
  password: z.string().min(1, "יש להזין סיסמה"),
});

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
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
