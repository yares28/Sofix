type Props = { linked: boolean; databaseLabel: string };

type Node = {
  id: string;
  label: string;
  sub: string;
  icon: React.ReactNode; // drawn in a 28 × 28 box (the "you" icon is wider)
  box: [x: number, y: number, width: number];
  sorare?: boolean; // one of the extension's two nodes: dashed until linked
};

function nodes(linked: boolean, databaseLabel: string): Node[] {
  return [
    {
      id: "github",
      label: "GitHub",
      sub: "jobs on a clock",
      box: [20, 38, 140],
      icon: (
        <>
          <circle cx="14" cy="14" r="13" fill="#1d1d1f" />
          <path d="M14 7v7l4 3" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ),
    },
    {
      id: "neon",
      label: "Neon",
      sub: databaseLabel,
      box: [290, 118, 100],
      icon: (
        <>
          <path d="M2 6v18c0 3 5 5 12 5s12-2 12-5V6" fill="#5cc58d" />
          <ellipse cx="14" cy="6" rx="12" ry="5" fill="#1f7a4f" />
        </>
      ),
    },
    { id: "vercel", label: "Vercel", sub: "the app, only for you", box: [470, 58, 160], icon: <path d="M14 2 27 26H1Z" fill="#1d1d1f" /> },
    {
      id: "you",
      label: "You",
      sub: "PC & phone",
      box: [470, 206, 160],
      icon: (
        <>
          <rect x="0" y="4" width="24" height="16" rx="3" fill="#1d1d1f" />
          <rect x="-3" y="20" width="30" height="3" rx="1.5" fill="#aeaeb2" />
          <rect x="27" y="2" width="11" height="21" rx="3" fill="#1d1d1f" />
        </>
      ),
    },
    {
      id: "extension",
      label: "Extension",
      sub: linked ? "in your Chrome" : "not linked yet",
      box: [290, 236, 130],
      sorare: true,
      icon: (
        <>
          <rect width="28" height="28" rx="8" fill="#f7c948" />
          <path d="M9 10h10M9 16h6" stroke="#5a3d00" strokeWidth="2.2" strokeLinecap="round" />
        </>
      ),
    },
    {
      id: "sorare",
      label: "sorare.com",
      sub: "your cards, lineups",
      box: [20, 230, 150],
      sorare: true,
      icon: (
        <>
          <circle cx="14" cy="14" r="13" fill="none" stroke="#1d1d1f" strokeWidth="2" />
          <path d="M14 8l5 3.6-1.9 5.8h-6.2L9 11.6Z" fill="#1d1d1f" />
        </>
      ),
    },
  ];
}

// The five links of the map: GitHub → Neon → Vercel → you, then you ↔ extension ↔ sorare.com.
const LINKS = [
  { id: "cc-map-1", d: "M160 70 C 225 70, 235 150, 290 150", dur: "2.6s", tone: "" },
  { id: "cc-map-2", d: "M390 150 C 435 150, 430 90, 470 90", dur: "2.2s", tone: "b" },
  { id: "cc-map-3", d: "M550 122 L 550 206", dur: "1.6s", tone: "b" },
  { id: "cc-map-4", d: "M470 250 C 445 250, 445 268, 420 268", dur: "2s", tone: "g", sorare: true },
  { id: "cc-map-5", d: "M290 268 C 240 268, 220 262, 170 262", dur: "2.2s", tone: "g", sorare: true },
];

/**
 * Where everything runs: jobs on GitHub write to Neon, Vercel serves the app to your PC and phone, and the
 * extension links it to sorare.com (dashed until it is linked). A map on wide screens, a column on phones.
 */
export default function HowItRuns({ linked, databaseLabel }: Props) {
  const all = nodes(linked, databaseLabel);
  return (
    <section className="cc-card cc-always" aria-labelledby="cc-always-title">
      <div>
        <p className="cc-eyebrow">Always on</p>
        <h3 id="cc-always-title">
          Open it anywhere.
          <br />
          Nothing to start.
        </h3>
        <p className="cc-lede">Refreshes run in the cloud, even with your PC off. Only you can open it.</p>
        <div className="cc-facts">
          <div>
            <b>€0</b>
            <span>every service on a free plan</span>
          </div>
          <div>
            <b>2×</b>
            <span>board refreshes a day</span>
          </div>
          <div>
            <b>1</b>
            <span>Chrome step, once</span>
          </div>
        </div>
      </div>

      <svg
        className="cc-map"
        viewBox="0 0 640 330"
        role="img"
        aria-label={`GitHub runs the jobs on a clock and writes to Neon; Vercel serves the app from Neon to your PC and phone; the Chrome extension ${linked ? "links" : "will link"} the app to sorare.com`}
      >
        <defs>
          <filter id="cc-map-soft" x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity=".10" />
          </filter>
        </defs>
        {LINKS.map((link) => (
          <path key={link.id} id={link.id} className={`lnk ${link.sorare && !linked ? "dash" : "live"}`} d={link.d} />
        ))}
        {LINKS.filter((link) => linked || !link.sorare).map((link) => (
          <circle key={`${link.id}-pkt`} r="4.5" className={`pkt ${link.tone}`}>
            <animateMotion dur={link.dur} repeatCount="indefinite">
              <mpath href={`#${link.id}`} />
            </animateMotion>
          </circle>
        ))}
        {all.map((node) => {
          const [x, y, width] = node.box;
          const text = node.id === "you" ? 58 : node.id === "neon" ? 48 : 50;
          return (
            <g key={node.id} className="node" transform={`translate(${x} ${y})`}>
              <rect width={width} height="64" rx="16" />
              <g transform={`translate(${node.id === "neon" || node.id === "extension" ? 12 : 14} ${node.id === "neon" ? 16 : node.id === "you" ? 17 : 18})`}>
                {node.icon}
              </g>
              <text x={text} y="30">
                {node.label}
              </text>
              <text className="s" x={text} y="46">
                {node.sub}
              </text>
            </g>
          );
        })}
      </svg>

      <ol className={`cc-flow${linked ? " linked" : ""}`} aria-label="How it runs">
        {all.map((node) => (
          <li key={node.id} className={node.sorare ? "ext" : undefined}>
            <svg viewBox={node.id === "you" ? "-4 0 44 28" : "-1 -1 30 32"} aria-hidden="true">
              {node.icon}
            </svg>
            <b>{node.label}</b>
            <span>{node.sub}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
