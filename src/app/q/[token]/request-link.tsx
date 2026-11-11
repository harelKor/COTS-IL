"use client";

import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/form";
import { requestNewLink } from "@/app/orders/actions";

/** "בקשו קישור חדש" on an expired approve link: the admin is told and resends the quote. */
export function RequestLink({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ sent?: boolean; error?: string }>({});
  if (state.sent) return <p role="status" className="text-callout text-success">הבקשה נשלחה. הספק הישראלי ישלח קישור חדש.</p>;
  return (
    <>
      {state.error && <Alert>{state.error}</Alert>}
      <Button className="self-start" disabled={pending} onClick={() => start(async () => setState(await requestNewLink(token)))}>
        בקשו קישור חדש
      </Button>
    </>
  );
}
