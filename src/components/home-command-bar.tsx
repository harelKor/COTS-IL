"use client";

import { ClipboardPaste, Search } from "lucide-react";
import { useSyncExternalStore } from "react";
import { openCartPaste } from "./cart-pill";
import { Ltr } from "./ltr";
import { openSearch } from "./search-panel";

const noSubscribe = () => () => {};
/** ⌘K on Apple devices, Ctrl K elsewhere. The server can't tell, so it renders ⌘K. */
const shortcut = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K");

/**
 * The home page's command bar: a big search trigger that opens the same search panel
 * as the header (no page reload), and pasting a SKU list or BOM straight into the cart.
 */
export function HomeCommandBar() {
  const keys = useSyncExternalStore(noSubscribe, shortcut, () => "⌘K");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch justify-center gap-3 sm:flex-row">
      <button
        type="button"
        onClick={openSearch}
        className="flex h-14 w-full max-w-xl min-w-0 shrink-0 items-center gap-3 rounded-full border-2 border-brand/20 bg-white ps-2 pe-5 text-start text-muted shadow-lift transition duration-200 ease-out hover:-translate-y-0.5 hover:border-brand/50 hover:text-foreground sm:w-auto sm:flex-1"
      >
        <span className="btn-brand flex size-10 shrink-0 items-center justify-center rounded-full" aria-hidden>
          <Search size={20} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px]">
          חיפוש מהיר לפי שם מוצר, מק״ט (למשל <Ltr className="font-mono">WCP-0749</Ltr>) או <Ltr>x4</Ltr> לכמות…
        </span>
        <kbd className="hidden shrink-0 rounded-md bg-subtle px-2 py-0.5 font-sans text-[12px] text-muted sm:inline" dir="ltr">
          {keys}
        </kbd>
      </button>
      <button
        type="button"
        onClick={openCartPaste}
        className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-white/90 px-5 shadow-card hover:border-brand/40 text-[15px] font-medium transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift"
      >
        <ClipboardPaste size={20} strokeWidth={1.75} className="text-brand" aria-hidden />
        הדבקת רשימת מק״טים / <Ltr>BOM</Ltr>
      </button>
    </div>
  );
}
