"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface TooltipHandle {
  show: (content: ReactNode) => void;
  move: (x: number, y: number) => void;
  hide: () => void;
}

/** Imperative so hovering doesn't re-render the whole board. */
const Tooltip = forwardRef<TooltipHandle>(function Tooltip(_props, ref) {
  const [content, setContent] = useState<ReactNode>(null);
  const [visible, setVisible] = useState(false);
  const node = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const place = () => {
    const el = node.current;
    if (!el) return;
    const { x, y } = pointer.current;
    const left = Math.min(x + 14, window.innerWidth - el.offsetWidth - 12);
    const below = y + 18;
    const top = below + el.offsetHeight > window.innerHeight - 8 ? y - el.offsetHeight - 12 : below;
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${Math.max(8, top)}px`;
  };

  // New content has a new size: position again once it is in the DOM.
  useLayoutEffect(place, [content]);

  useImperativeHandle(ref, () => ({
    show(next) {
      setContent(next);
      setVisible(true);
    },
    move(x, y) {
      pointer.current = { x, y };
      place();
    },
    hide() {
      setVisible(false);
    },
  }), []);

  return (
    <div ref={node} className={`tip ${visible ? "show" : ""}`} role="tooltip">
      {content}
    </div>
  );
});

export default Tooltip;
