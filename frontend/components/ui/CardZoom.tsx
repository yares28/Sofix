import type { ComponentPropsWithoutRef } from "react";
import styles from "./CardZoom.module.css";

/** Enlarges card art without adding a tooltip, tab stop, or changing its click target. */
export default function CardZoom({ as: Tag = "span", className = "", ...props }: Omit<ComponentPropsWithoutRef<"span">, "title"> & { as?: "span" | "div" }) {
  return <Tag {...props} className={`${className} ${styles.zoom}`} data-card-zoom="" />;
}
