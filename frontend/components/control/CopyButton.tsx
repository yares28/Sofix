"use client";

import { useEffect, useState } from "react";

/** A small "Copy" button that says "Copied" for a moment. `label` tells screen readers what it copies. */
export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={`cc-mini${copied ? " ok" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          // Clipboard blocked: the text is on screen to copy by hand.
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
      <span className="visually-hidden"> {label}</span>
    </button>
  );
}
