export type Platform = "ios" | "android" | "desktop";

/** Which install instructions fit this device. iPads report themselves as a Mac with a touch screen. */
export function platformOf(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  return "desktop";
}

/**
 * Chrome announces that a page can be installed once, often before React has hydrated, so the root layout catches
 * the event with this inline script and keeps it on `window` until the Install button asks for it
 * (components/control/GetTheApp.tsx).
 */
export const INSTALL_CAPTURE_SCRIPT =
  'addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__sofixInstall=e;dispatchEvent(new Event("sofix-install"))});' +
  'addEventListener("appinstalled",function(){window.__sofixInstall=null;window.__sofixInstalled=true;dispatchEvent(new Event("sofix-install"))});';
