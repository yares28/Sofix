import type { ButtonHTMLAttributes } from "react";
import styles from "./DataAction.module.css";

/** One named icon treatment for existing read and refresh operations. */
export default function DataAction({ label, kind = "scores", busy = false, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; kind?: "board" | "start" | "scores"; busy?: boolean }) {
  return <button {...props} type="button" className={`${styles.action} ${className}`} aria-label={label} title={props.title ?? label} aria-busy={busy} disabled={busy || props.disabled}>
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {kind === "board" ? <><rect x="3" y="5" width="10" height="12" rx="2" /><path d="M7 2h8a2 2 0 0 1 2 2v10M6 9h4M6 12h4" /></>
        : kind === "start" ? <><circle cx="6" cy="6" r="2" /><circle cx="14" cy="14" r="2" /><path d="m5 15 10-10" /></>
        : <path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3.6h-3.6" />}
    </svg>
  </button>;
}
