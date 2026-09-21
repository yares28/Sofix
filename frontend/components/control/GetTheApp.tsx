"use client";

import { useCallback, useEffect, useState } from "react";
import { STRIPES } from "../../lib/appIcon";
import { platformOf, type Platform } from "../../lib/install";
import type { QrCode } from "../../lib/qr";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type InstallWindow = Window & { __sofixInstall?: PromptEvent | null; __sofixInstalled?: boolean };

/** Chrome's own install prompt, caught early by the root layout (lib/install.ts INSTALL_CAPTURE_SCRIPT). */
function useInstallPrompt() {
  const [state, setState] = useState({ canInstall: false, installed: false });

  useEffect(() => {
    const w = window as InstallWindow;
    const sync = () => setState({ canInstall: Boolean(w.__sofixInstall), installed: Boolean(w.__sofixInstalled) });
    sync();
    window.addEventListener("sofix-install", sync);
    return () => window.removeEventListener("sofix-install", sync);
  }, []);

  const install = useCallback(async () => {
    const w = window as InstallWindow;
    const event = w.__sofixInstall;
    if (!event) return;
    w.__sofixInstall = null; // a prompt can only be shown once
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") w.__sofixInstalled = true;
    window.dispatchEvent(new Event("sofix-install"));
  }, []);

  return { ...state, install };
}

const HOW: Record<Platform, string> = {
  desktop: "In Chrome or Edge: the Install icon at the end of the address bar.",
  ios: "In Safari: Share, then Add to Home Screen.",
  android: "In Chrome: menu ⋮, then Add to Home screen.",
};

function QrMark({ qr, host }: { qr: QrCode; host: string }) {
  const { size, modules, finders, logo } = qr;
  const stripe = logo.size / STRIPES.length;
  return (
    <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} role="img" aria-label={`QR code for ${host}`}>
      <rect x={-1} y={-1} width={size + 2} height={size + 2} fill="#fff" />
      <path d={modules} fill="#1d1d1f" shapeRendering="crispEdges" />
      {finders.map(([fx, fy]) => (
        <g key={`${fx}-${fy}`}>
          <rect x={fx + 0.5} y={fy + 0.5} width={6} height={6} rx={1.7} fill="none" stroke="#1d1d1f" strokeWidth={1} />
          <rect x={fx + 2} y={fy + 2} width={3} height={3} rx={0.9} fill="#1d1d1f" />
        </g>
      ))}
      <clipPath id="cc-qr-logo">
        <rect x={logo.at} y={logo.at} width={logo.size} height={logo.size} rx={logo.size * 0.24} />
      </clipPath>
      <g clipPath="url(#cc-qr-logo)">
        {STRIPES.map((color, i) => (
          <rect key={color} x={logo.at + i * stripe} y={logo.at} width={stripe + 0.05} height={logo.size} fill={color} />
        ))}
      </g>
    </svg>
  );
}

/**
 * Install once per device: Chrome's prompt where it exists, the right words elsewhere, and a QR code on the PC
 * for the phone. Hidden inside the installed app itself (CSS `display-mode: standalone`, so no flash).
 */
export default function GetTheApp({ host, qr }: { host: string; qr: QrCode }) {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const { canInstall, installed, install } = useInstallPrompt();

  useEffect(() => setPlatform(platformOf(navigator.userAgent, navigator.maxTouchPoints)), []);

  return (
    <section className="cc-card cc-getapp" aria-labelledby="cc-getapp-title">
      <div>
        <p className="cc-eyebrow">Install once per device</p>
        <h3 id="cc-getapp-title">
          Your icon.
          <br />
          Its own window.
        </h3>
        {installed ? (
          <p className="cc-lede">Installed. Open Sofix from your apps.</p>
        ) : canInstall ? (
          <button type="button" className="cc-btn primary" onClick={install}>
            Install Sofix
          </button>
        ) : (
          <p className="cc-lede">{HOW[platform]}</p>
        )}
        <div className="cc-url">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="2.5" y="6" width="9" height="6.5" rx="1.5" fill="currentColor" />
            <path d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          {host}
        </div>
        {platform === "desktop" && (
          <div className="cc-qrrow">
            <div className="cc-qr">
              <QrMark qr={qr} host={host} />
            </div>
            <span>
              On your phone: scan it,
              <br />
              then Add to Home Screen.
            </span>
          </div>
        )}
      </div>
      <div className="cc-devices" aria-hidden="true">
        <div className="laptop">
          <div className="screen">
            <div className="app">
              <div className="bar2">
                <i />
                <span>Sofix</span>
              </div>
              <div className="content">
                <div />
                <div />
                <div />
                <div />
                <div />
                <div />
              </div>
            </div>
          </div>
          <div className="base" />
        </div>
        <div className="phone">
          <div className="scr">
            <span className="notch" />
            <div className="icons">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} className={i === 6 ? "me" : undefined} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
