import Link from "next/link";
import { signout } from "@/app/auth/actions";
import { getViewer } from "@/lib/auth";

export async function SiteHeader() {
  const viewer = await getViewer();
  const team = viewer?.teams[0];

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="font-bold">
          פורטל רכש <span className="ltr">FIRST</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {viewer ? (
            <>
              {viewer.isAdmin && (
                <Link href="/admin" className="hover:text-brand">
                  ניהול
                </Link>
              )}
              <span className="hidden text-muted sm:inline">
                {team ? (
                  <>
                    {team.name} · <span className="ltr">{`${team.program} ${team.number}`}</span>
                  </>
                ) : (
                  <span className="ltr">{viewer.email}</span>
                )}
              </span>
              <form action={signout}>
                <button className="hover:text-brand">יציאה</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-brand">
                כניסה
              </Link>
              <Link href="/signup" className="rounded-md bg-brand px-3 py-1.5 text-white hover:bg-brand-strong">
                הרשמת קבוצה
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
