"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

/**
 * A lineup opens in a sheet: its cards, their fixtures, the rules it satisfies and the reward ladder.
 * The card itself stays on the server; this only opens and closes the dialog, and returns focus.
 */
export default function LineupSheet({
  title,
  head,
  card,
  children,
}: {
  title: string;
  head: ReactNode;
  card: ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    // clicking the dark area around the sheet closes it (the dialog itself fills the screen)
    const outside = (event: MouseEvent) => {
      if (event.target === node) setOpen(false);
    };
    node.addEventListener("click", outside);
    return () => node.removeEventListener("click", outside);
  }, []);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="pl-lu"
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => setOpen(true)}
      >
        {card}
      </button>
      <dialog
        id={id}
        ref={dialog}
        className="pl-scrim"
        aria-label={title}
        onClose={() => {
          setOpen(false);
          button.current?.focus();
        }}
      >
        <div className="pl-sheet">
          <div className="pl-sh-head">
            {head}
            <button type="button" className="pl-x" aria-label="Close" onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="pl-sh-body">{children}</div>
        </div>
      </dialog>
    </>
  );
}
