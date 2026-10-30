"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { measurePage, navigationKey, type PageGeometry } from "../../lib/navigationSkeleton";
import PageSkeleton, { pageLayout } from "./PageSkeleton";

type Pending = { url: URL; geometry?: PageGeometry; reserveHeight?: number };
type Options = { scroll?: boolean };
type NavigationState = {
  pending: Pending | null;
  navigate: (href: string, options?: Options, replace?: boolean) => void;
  complete: () => void;
};
const Navigation = createContext<NavigationState | null>(null);

/** One transition owns both immediate feedback and completion; no additional server request or loading boundary. */
export default function NavigationProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [transitioning, start] = useTransition();
  const pages = useRef(new Map<string, { at: number; geometry: PageGeometry }>());
  const content = useRef<HTMLDivElement>(null);
  const current = useRef(path);

  const show = useCallback((href: string, scroll = true) => {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !navigator.onLine || !pageLayout(url) || navigationKey(url, 0) === navigationKey(new URL(current.current, window.location.origin), 0)) return;
    const main = content.current?.querySelector<HTMLElement>("main");
    if (main && window.scrollY === 0 && !content.current?.hasAttribute("data-pending")) {
      const key = navigationKey(new URL(current.current, window.location.origin), window.innerWidth);
      pages.current.delete(key);
      pages.current.set(key, { at: Date.now(), geometry: measurePage(main) });
      if (pages.current.size > 24) pages.current.delete(pages.current.keys().next().value!);
    }
    const saved = pages.current.get(navigationKey(url, window.innerWidth));
    const geometry = saved && Date.now() - saved.at < 5 * 60_000 ? saved.geometry : undefined;
    const reserveHeight = !scroll && main ? main.getBoundingClientRect().height : undefined;
    setPending({ url, geometry, reserveHeight });
  }, []);

  const complete = useCallback(() => {
    current.current = window.location.href;
    setPending(null);
  }, []);
  const navigate = useCallback((href: string, options?: Options, replace = false) => {
    flushSync(() => show(href, options?.scroll));
    if (options?.scroll !== false && !new URL(href, window.location.href).hash) window.scrollTo({ top: 0, behavior: "instant" });
    start(() => replace ? router.replace(href, options) : router.push(href, options));
  }, [router, show]);

  useEffect(() => { if (!transitioning) complete(); }, [transitioning, complete]);
  useEffect(complete, [path, children, complete]);
  useEffect(() => {
    const history = () => show(window.location.href, false);
    window.addEventListener("popstate", history);
    window.addEventListener("pageshow", complete);
    window.addEventListener("offline", complete);
    return () => {
      window.removeEventListener("popstate", history);
      window.removeEventListener("pageshow", complete);
      window.removeEventListener("offline", complete);
    };
  }, [show, complete]);
  const value = useMemo(() => ({ pending, navigate, complete }), [pending, navigate, complete]);
  const layout = pending ? pageLayout(pending.url) : null;
  return (
    <Navigation.Provider value={value}>
      <div ref={content} className="navigation-content" data-pending={pending ? "" : undefined}>{children}</div>
      <span className="visually-hidden" role={layout ? "status" : undefined} aria-label={layout ? "Page loading" : undefined} aria-live="polite" aria-atomic="true">{layout ? `Loading ${layout.label}…` : ""}</span>
      {pending && layout ? <PageSkeleton layout={layout} geometry={pending.geometry} reserveHeight={pending.reserveHeight} /> : null}
    </Navigation.Provider>
  );
}

/** Query-only history changes complete where their dynamic page already reads the search params. */
export function NavigationComplete() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const navigation = useContext(Navigation);
  const complete = navigation?.complete;
  useEffect(() => { complete?.(); }, [path, search, complete]);
  return null;
}

export function useNavigationPath() {
  const path = usePathname();
  return useContext(Navigation)?.pending?.url.pathname ?? path;
}

export function useNavigationTarget() { return useContext(Navigation)?.pending?.url.href ?? null; }
export function useNavigationController() { return useContext(Navigation)?.navigate ?? null; }

export function useNavigationRouter() {
  const router = useRouter();
  const navigation = useContext(Navigation);
  const navigate = navigation?.navigate;
  return useMemo(() => ({
    ...router,
    push: (href: string, options?: Options) => navigate ? navigate(href, options) : router.push(href, options),
    replace: (href: string, options?: Options) => navigate ? navigate(href, options, true) : router.replace(href, options),
  }), [router, navigate]);
}
