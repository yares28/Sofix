"use client";

import {
  useEffect, useRef,
  type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent,
} from "react";
import CellTooltip from "../components/CellTooltip";
import type { TooltipHandle } from "../components/Tooltip";
import type { GridCell, GridTeam } from "../lib/types";

type CellIndex = Map<string, { team: GridTeam; cell: GridCell; matchday: number }>;

const ARROWS: Record<string, [number, number] | undefined> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

const tileOf = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-key]") ?? null;

/**
 * Tooltip and keyboard behaviour for the fixture tiles, delegated from the table:
 * hover follows the pointer, keyboard focus and taps anchor to the tile, Escape or a tap outside closes,
 * and arrow keys move between tiles (rows × visible columns, skipping blank weeks).
 */
export function useTileTooltip(cellIndex: CellIndex, teams: Map<string, GridTeam>, rowCount: number, start: number, end: number) {
  const tooltip = useRef<TooltipHandle>(null);
  const hoveredKey = useRef<string | null>(null);
  const lastPointer = useRef<string>("mouse");

  const hide = () => {
    hoveredKey.current = null;
    tooltip.current?.hide();
  };
  const content = (key: string) => {
    const entry = cellIndex.get(key);
    return entry ? <CellTooltip {...entry} teams={teams} /> : null;
  };
  const showFor = (tile: HTMLElement) => {
    const key = tile.dataset.key;
    const body = key ? content(key) : null;
    if (!key || !body) return;
    hoveredKey.current = key;
    tooltip.current?.show(body);
    tooltip.current?.anchor(tile);
  };

  useEffect(() => {
    const close = () => {
      hoveredKey.current = null;
      tooltip.current?.hide();
    };
    // Scrolling moves the tiles: follow a keyboard-focused tile, otherwise close.
    const onScroll = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.dataset.key && active.dataset.key === hoveredKey.current) {
        tooltip.current?.anchor(active);
      } else {
        close();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointerDown = (event: PointerEvent) => {
      lastPointer.current = event.pointerType;
      if (!tileOf(event.target)) close(); // tap outside closes
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "mouse") lastPointer.current = "mouse";
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  const tableHandlers = {
    onMouseMove(event: ReactMouseEvent<HTMLTableElement>) {
      if (lastPointer.current === "touch") return; // emulated mouse events after a tap
      const key = tileOf(event.target)?.dataset.key ?? null;
      if (!key) {
        hide();
        return;
      }
      if (key !== hoveredKey.current) {
        const body = content(key);
        hoveredKey.current = key;
        if (body) tooltip.current?.show(body);
      }
      tooltip.current?.move(event.clientX, event.clientY);
    },
    onMouseLeave: hide,
    // Keyboard focus opens the tooltip; mouse focus doesn't (hover already did).
    onFocus(event: ReactFocusEvent<HTMLTableElement>) {
      const tile = tileOf(event.target);
      if (tile?.matches(":focus-visible")) showFor(tile);
    },
    onBlur(event: ReactFocusEvent<HTMLTableElement>) {
      if (tileOf(event.target) && !tileOf(event.relatedTarget)) hide();
    },
    // Touch has no hover: a tap opens the tooltip next to the tile.
    onClick(event: ReactMouseEvent<HTMLTableElement>) {
      const tile = tileOf(event.target);
      if (tile && lastPointer.current === "touch") showFor(tile);
    },
    onKeyDown(event: ReactKeyboardEvent<HTMLTableElement>) {
      const step = ARROWS[event.key];
      const tile = tileOf(event.target);
      if (!step || !tile) return;
      const [dRow, dCol] = step;
      let row = Number(tile.dataset.row) + dRow;
      let col = Number(tile.dataset.col) + dCol;
      while (row >= 0 && row < rowCount && col >= start && col < end) {
        const next = event.currentTarget.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
        if (next) {
          event.preventDefault();
          next.focus();
          return;
        }
        row += dRow;
        col += dCol;
      }
    },
  };

  return { tooltip, tableHandlers };
}
