"use client";

import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface TooltipHandle {
  show: (content: ReactNode) => void;
  move: (x: number, y: number) => void;
  /** Place next to an element (keyboard focus, taps) instead of following the pointer. */
  anchor: (element: Element) => void;
  hide: () => void;
}

/** Imperative so hovering doesn't re-render the whole board; positioning runs at most once per frame. */
const Tooltip = forwardRef<TooltipHandle>(function Tooltip(_props, ref) {
  const [content, setContent] = useState<ReactNode>(null);
  const [visible, setVisible] = useState(false);
  const node = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);

  const place = useCallback(() => {
    frame.current = null;
    const el = node.current;
    if (!el) return;
    const { x, y } = pointer.current;
    const left = Math.min(x + 14, window.innerWidth - el.offsetWidth - 12);
    const below = y + 18;
    const top = below + el.offsetHeight > window.innerHeight - 8 ? y - el.offsetHeight - 12 : below;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;
  }, []);
  // mousemove fires far more often than the screen repaints; reading offsetWidth each time forces layout.
  const schedule = useCallback(() => {
    if (frame.current === null) frame.current = window.requestAnimationFrame(place);
  }, [place]);

  // New content has a new size: position again once it is in the DOM.
  useLayoutEffect(() => place(), [content, place]);
  useLayoutEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    show(next) {
      setContent(next);
      setVisible(true);
    },
    move(x, y) {
      pointer.current = { x, y };
      schedule();
    },
    anchor(element) {
      const rect = element.getBoundingClientRect();
      pointer.current = { x: rect.left + rect.width / 2 - 14, y: rect.bottom - 10 };
      schedule();
    },
    hide() {
      setVisible(false);
    },
  }), [schedule]);

  return (
    // aria-hidden: each tile's aria-label already says what the tooltip shows.
    <div ref={node} className={`tip ${visible ? "show" : ""}`} aria-hidden="true">
      {content}
    </div>
  );
});

export default Tooltip;
