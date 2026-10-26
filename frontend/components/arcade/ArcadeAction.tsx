import type { ButtonHTMLAttributes } from "react";
import DataAction from "../ui/DataAction";

/** Compact named controls, sharing Arcade's existing icon and focus treatment. */
export default function ArcadeAction({ label, kind, busy = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; kind: "board" | "start" | "scores"; busy?: boolean }) {
  return <DataAction {...props} label={label} kind={kind} busy={busy} />;
}
