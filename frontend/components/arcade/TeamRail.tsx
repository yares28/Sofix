"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

const PAGE = 12;

/** One row of teams, with two-item steps and native touch scrolling. */
export default function TeamRail({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  const items = Children.toArray(children);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const at = Math.min(page, pages - 1);
  const track = useRef<HTMLUListElement>(null);
  const drag = useRef<{ x: number; scroll: number; moved: boolean } | null>(null);
  const [edges, setEdges] = useState({ left: true, right: true });
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.scrollLeft = 0;
    const measure = () => setEdges({ left: el.scrollLeft < 1, right: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => { observer.disconnect(); el.removeEventListener("scroll", measure); };
  }, [at, items.length]);
  const step = (direction: number) => {
    const el = track.current;
    const first = el?.firstElementChild;
    if (!el || !first) return;
    const stride = first.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap);
    el.scrollTo({ left: (Math.round(el.scrollLeft / stride) + direction * 2) * stride, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return (
    <div className={`arc-rail ${className}`}>
      <div className="arc-rail-controls">
        <button type="button" className="arc-small" aria-label="Previous two teams" disabled={edges.left} onClick={() => step(-1)}><span aria-hidden="true">←</span></button>
        <button type="button" className="arc-small" aria-label="Next two teams" disabled={edges.right} onClick={() => step(1)}><span aria-hidden="true">→</span></button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The overflow region needs keyboard focus and arrows for scrolling, independently of its team buttons. */}
      <ul ref={track} className="arc-rail-track" role="group" aria-label={label} tabIndex={0}
        onKeyDown={(e) => { if (e.target === e.currentTarget && ["ArrowLeft", "ArrowRight"].includes(e.key)) { e.preventDefault(); step(e.key === "ArrowLeft" ? -1 : 1); } }}
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={(e) => { drag.current = e.pointerType === "mouse" && e.button === 0 ? { x: e.clientX, scroll: e.currentTarget.scrollLeft, moved: false } : null; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || e.buttons !== 1) return;
          if (Math.abs(e.clientX - d.x) > 6) { d.moved = true; e.currentTarget.dataset.dragging = "true"; e.currentTarget.setPointerCapture(e.pointerId); }
          if (d.moved) { e.preventDefault(); e.currentTarget.scrollLeft = d.scroll + d.x - e.clientX; }
        }}
        onPointerUp={(e) => { delete e.currentTarget.dataset.dragging; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={(e) => { drag.current = null; delete e.currentTarget.dataset.dragging; }}
        onClickCapture={(e) => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation(); drag.current = null; } }}>
        {items.slice(at * PAGE, (at + 1) * PAGE).map((child, i) => <li className="arc-rail-item" key={i}>{child}</li>)}
      </ul>
      {pages > 1 ? <nav className="arc-pager" aria-label={`${label} pages`}>
        <button type="button" aria-label="Previous page" disabled={!at} onClick={() => setPage(at - 1)}>Previous</button>
        <span>Page {at + 1} of {pages}</span>
        <button type="button" aria-label="Next page" disabled={at === pages - 1} onClick={() => setPage(at + 1)}>Next</button>
      </nav> : null}
    </div>
  );
}
