"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { OrderStatusKey } from "@/domain/order-status";
import { loadOrderPanel } from "./panel-action";

/** Panels already fetched in this tab, so a reopened card shows at once. Kept fresh by refetching quietly. */
const cache = new Map<string, ReactNode>();
const OPENED = "admin-card-opened";

/** Keeps the address in step with the open card without asking the server for anything. */
function setUrl(name: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  if (name === "open") url.searchParams.delete("edit");
  window.history.replaceState(null, "", url);
}

/** Same layout as the details, shown while they load. */
function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div className="skeleton h-24 w-full rounded-[14px]" />
      <div className="flex flex-col gap-3">
        <div className="skeleton h-5 w-32" />
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-14 w-full" />
      </div>
      <div className="skeleton h-11 w-48 rounded-full" />
    </div>
  );
}

/**
 * One order card. Opening and closing happen here, in the browser; the details come from a server
 * action on first open (or on hover/focus) and stay in memory for next time.
 */
export function OrderCardShell({
  orderId,
  status,
  version,
  edgeClass,
  initialOpen,
  serverPanel,
  checkbox,
  head,
  meta,
  action,
  chips,
}: {
  orderId: string;
  status: OrderStatusKey;
  /** Changes when the order's summary changes, so a stale cached panel isn't trusted. */
  version: string;
  edgeClass: string;
  initialOpen: boolean;
  /** Rendered by the page when the URL already asks for this card to be open. */
  serverPanel: ReactNode;
  checkbox: ReactNode;
  head: ReactNode;
  meta: ReactNode;
  action: ReactNode;
  chips: ReactNode;
}) {
  const key = `${orderId}|${status}|${version}`;
  const [open, setOpen] = useState(initialOpen);
  const [everOpened, setEverOpened] = useState(initialOpen);
  const [panel, setPanel] = useState<ReactNode>(serverPanel ?? cache.get(key) ?? null);
  const [seen, setSeen] = useState(serverPanel);
  const inFlight = useRef(false);

  // A fresh render from the server (after an action, or a link to ?edit=1) replaces what we hold.
  if (serverPanel !== seen) {
    setSeen(serverPanel);
    if (serverPanel) {
      cache.set(key, serverPanel);
      setPanel(serverPanel);
      setOpen(true);
      setEverOpened(true);
    }
  }

  function fetchPanel() {
    if (inFlight.current) return;
    inFlight.current = true;
    loadOrderPanel(orderId, status, false)
      .then((node) => {
        cache.set(key, node);
        setPanel(node);
      })
      .catch(() => {})
      .finally(() => {
        inFlight.current = false;
      });
  }

  // One card open at a time, as before.
  useEffect(() => {
    const onOpened = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== orderId) setOpen(false);
    };
    window.addEventListener(OPENED, onOpened);
    return () => window.removeEventListener(OPENED, onOpened);
  }, [orderId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setEverOpened(true);
      window.dispatchEvent(new CustomEvent(OPENED, { detail: orderId }));
      if (!panel) setPanel(cache.get(key) ?? null);
      fetchPanel();
    }
    setUrl("open", next ? orderId : null);
  }

  function warm() {
    if (!panel && !cache.has(key)) fetchPanel();
  }

  return (
    <li id={`o-${orderId}`} className={`card-surface flex scroll-mt-20 flex-col rounded-[18px] border-s-4 ${edgeClass}`}>
      <div className="flex">
        {checkbox}
        <button
          type="button"
          onClick={toggle}
          onPointerEnter={warm}
          onFocus={warm}
          onTouchStart={warm}
          aria-expanded={open}
          aria-controls={`panel-${orderId}`}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-2 p-4 text-start"
        >
          {head}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {meta}
            {!open && action}
          </div>
          {chips}
        </button>
      </div>
      <div
        id={`panel-${orderId}`}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          {everOpened && <div className="border-t border-line p-4">{panel ?? <PanelSkeleton />}</div>}
        </div>
      </div>
    </li>
  );
}

/** "Finished orders" opens and closes in the browser; its cards are already on the page. */
export function FinishedSection({ initialOpen, count, children }: { initialOpen: boolean; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setUrl("finished", open ? null : "1");
        }}
        aria-expanded={open}
        className="flex min-h-11 cursor-pointer items-center justify-between rounded-full bg-subtle px-4 font-semibold hover:bg-subtle-hover"
      >
        הזמנות שהסתיימו ({count})
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      <ul hidden={!open} className="flex flex-col gap-3">
        {children}
      </ul>
    </section>
  );
}
