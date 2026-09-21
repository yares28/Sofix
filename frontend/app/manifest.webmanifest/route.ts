import type { MetadataRoute } from "next";

// Makes Sofix installable: Chrome's "Install" on the PC, "Add to Home Screen" on the phone.
// It then opens in its own window, with the stripe icon, like an app.
// A route instead of app/manifest.ts: Vercel's login guards every path, and browsers fetch a manifest without
// cookies unless its <link> says crossorigin="use-credentials", which Next only adds on preview deployments.
// The root layout links this file with that attribute.
export const dynamic = "force-static";

const manifest: MetadataRoute.Manifest = {
  id: "/",
  name: "Sofix",
  short_name: "Sofix",
  description: "LaLiga fixture difficulty and Sorare lineups.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#fbfbfd",
  theme_color: "#fbfbfd",
  icons: [
    { src: "/app-icon/any-192", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/app-icon/any-512", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/app-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  shortcuts: [{ name: "Control Center", url: "/control" }],
};

export function GET() {
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json" } });
}
