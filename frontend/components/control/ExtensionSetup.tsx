"use client";

import { useEffect, useState } from "react";
import CopyButton from "./CopyButton";

/** add: not in this Chrome yet · sign-in: added, but it hasn't seen a Sorare account · done: linked just now. */
export type ExtensionStage = "add" | "sign-in" | "done";

type Props = { stage: ExtensionStage; user: string | null; version: string | null; extensionDir: string | null };

// Where the pointer goes in the Chrome picture for each phase (percent of its body): the Developer mode label, its
// switch, "Load unpacked", then the extension's card.
const SPOTS: [number, number][] = [
  [62, 12],
  [84, 12],
  [14, 30],
  [50, 80],
];

const HEAD: Record<ExtensionStage, { eyebrow: string; title: (user: string | null) => string; lede: string }> = {
  add: { eyebrow: "On your PC · once · about a minute", title: () => "Add the Sorare extension", lede: "Then lineups save to Sorare from the app." },
  "sign-in": { eyebrow: "Almost there", title: () => "Now open sorare.com", lede: "Signed in as usual, once, so the extension learns your account." },
  done: { eyebrow: "Done", title: (user) => (user ? `Linked as ${user}` : "Extension linked"), lede: "Sorare, the extension and Sofix are connected." },
};

/**
 * The one manual step: Chrome only loads an extension that isn't in the Web Store through Developer mode.
 * The picture on the right acts the steps out in sync with the list; the page learns that it worked by pinging the
 * extension (components/ControlCenter.tsx), so the card updates when the owner comes back to the tab.
 */
export default function ExtensionSetup({ stage, user, version, extensionDir }: Props) {
  const [phase, setPhase] = useState(stage === "add" ? 0 : 3);

  useEffect(() => {
    if (stage !== "add") {
      setPhase(3);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(2); // one still frame: the moment that matters, "Load unpacked" and the folder
      return;
    }
    const timer = window.setInterval(() => setPhase((current) => (current + 1) % 4), 1800);
    return () => window.clearInterval(timer);
  }, [stage]);

  const active = stage === "add" ? Math.min(phase, 2) : stage === "sign-in" ? 3 : -1;
  const doneUpTo = stage === "add" ? -1 : stage === "sign-in" ? 2 : 3;
  const head = HEAD[stage];
  const [x, y] = SPOTS[phase] ?? [50, 80];

  const steps = [
    {
      title: "Open chrome://extensions",
      sub: "paste it in the address bar",
      action: <CopyButton text="chrome://extensions" label="chrome://extensions" />,
    },
    { title: "Turn on Developer mode", sub: "the switch at the top right", action: null },
    {
      title: "Load unpacked, pick the folder",
      sub: extensionDir ?? "the extension folder in Sofix's code",
      mono: Boolean(extensionDir),
      action: extensionDir ? <CopyButton text={extensionDir} label="the folder path" /> : null,
    },
    {
      title: "Open sorare.com, signed in",
      sub: "the extension learns your account",
      action: (
        <a className="cc-mini" href="https://sorare.com/" target="_blank" rel="noreferrer">
          Open
          <span className="visually-hidden"> sorare.com in a new tab</span>
        </a>
      ),
    },
  ];

  return (
    <section className={`cc-card cc-ext ${stage}`} id="extension" aria-labelledby="cc-ext-title">
      <div>
        <p className="cc-eyebrow">{head.eyebrow}</p>
        <h3 id="cc-ext-title">{head.title(user)}</h3>
        <p className="cc-lede">{head.lede}</p>
        <ol className="cc-steps">
          {steps.map((step, i) => {
            const done = i <= doneUpTo;
            return (
              <li key={step.title} className={`cc-step${i === active ? " on" : ""}${done ? " done" : ""}`}>
                <span className="n" aria-hidden="true">
                  {done ? "✓" : i + 1}
                </span>
                <div>
                  <b>
                    {step.title}
                    {done && <span className="visually-hidden"> (done)</span>}
                  </b>
                  <span className={step.mono ? "mono" : undefined}>{step.sub}</span>
                </div>
                {!done && step.action}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="cc-browser" aria-hidden="true">
        <div className="b-top">
          <i />
          <i />
          <i />
          <span className="addr">chrome://extensions</span>
        </div>
        <div className={`b-body s${phase}`}>
          <div className="b-head">
            Extensions
            <span className="dev">
              Developer mode <span className="tg" />
            </span>
          </div>
          <div className="devbar">
            <span>Load unpacked</span>
            <span>Pack extension</span>
            <span>Update</span>
          </div>
          <div className="picker">
            Select the extension directory
            <code>{extensionDir ?? "…\\Sofix\\extension"}</code>
          </div>
          <div className="xcard">
            <i />
            <div>
              <b>Sofix</b>
              <span>{version ? `${version} · ` : ""}connected to the app</span>
            </div>
            <span className="tg" />
          </div>
          {stage === "add" && (
            <span className="cursor" style={{ left: `${x}%`, top: `${y}%` }}>
              <svg viewBox="0 0 18 18">
                <path d="M2 1l13 7-6 1.5L6.5 16Z" fill="#1d1d1f" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              {phase < 3 && <span className="tap" key={phase} />}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
