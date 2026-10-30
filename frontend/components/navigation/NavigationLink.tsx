"use client";

import Link from "next/link";
import { forwardRef, useCallback, useRef, type ComponentProps } from "react";
import { useNavigationController, useNavigationTarget } from "./NavigationProvider";

/** Keep Next's modifier keys, prefetch policy, cancellation and native anchor semantics. */
const NavigationLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(function NavigationLink({ onNavigate, href, scroll, replace, children, ...props }, ref) {
  const navigate = useNavigationController();
  const target = useNavigationTarget();
  const pending = target && typeof href === "string" && new URL(href, target).href === target;
  const anchor = useRef<HTMLAnchorElement | null>(null);
  const setAnchor = useCallback((element: HTMLAnchorElement | null) => { anchor.current = element; if (typeof ref === "function") ref(element); else if (ref) ref.current = element; }, [ref]);
  return <Link {...props} ref={setAnchor} href={href} scroll={scroll} replace={replace} onNavigate={(event) => {
    let cancelled = false;
    onNavigate?.({ preventDefault() { cancelled = true; event.preventDefault(); } });
    if (!cancelled) {
      if (anchor.current && navigate) {
        event.preventDefault();
        navigate(anchor.current.href, { scroll }, replace);
      }
    }
  }}>{children}{pending ? <span className="link-pending" hidden /> : null}</Link>;
});

export default NavigationLink;
