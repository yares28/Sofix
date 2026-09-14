"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "md" | "lg";
}

export default function SegmentedControl<T extends string>({ options, value, onChange, label, size = "md" }: Props<T>) {
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    let active = true; // a late fonts.ready must not move the thumb back to an old option
    const place = () => {
      const button = buttons.current[value];
      if (active && button) setThumb({ left: button.offsetLeft, width: button.offsetWidth });
    };
    place();
    window.addEventListener("resize", place);
    document.fonts?.ready.then(place);
    return () => {
      active = false;
      window.removeEventListener("resize", place);
    };
  }, [value]);

  return (
    <div className={`segmented ${size === "lg" ? "lg" : ""}`} role="group" aria-label={label}>
      {thumb && <div className="thumb" style={{ width: thumb.width, transform: `translateX(${thumb.left - 3}px)` }} />}
      {options.map((option) => (
        <button
          key={option.value}
          ref={(el) => {
            buttons.current[option.value] = el;
          }}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
