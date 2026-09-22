import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  meta?: string;
  href?: string; // the page the whole tile opens; none for a tile whose page doesn't exist yet
  className: string;
  index: number; // rise-in order
  children: ReactNode;
};

const CHEVRON = (
  <svg className="hm-chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="m5 2 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A bento tile: its title is the link, stretched over the whole tile, so one click anywhere opens the page. */
export default function HomeTile({ id, title, meta, href, className, index, children }: Props) {
  return (
    <section className={`hm-tile ${className}`} style={{ "--i": index } as React.CSSProperties} aria-labelledby={id}>
      <header className="hm-head">
        <h2 id={id}>
          {href ? (
            <Link href={href} className="hm-link">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        {meta && <span className="hm-meta">{meta}</span>}
        {href && CHEVRON}
      </header>
      {children}
    </section>
  );
}
