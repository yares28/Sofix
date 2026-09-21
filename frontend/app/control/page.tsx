import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import ControlCenter from "../../components/ControlCenter";
import SiteNav from "../../components/SiteNav";
import { loadGrid } from "../../lib/api";
import { githubTokenUrl, VERCEL_ENV_URL } from "../../lib/github";
import { qrCode } from "../../lib/qr";
import { loadSystem } from "../../lib/system";

export const metadata: Metadata = { title: "Control Center · Sofix" };

/** The address to install from: production's own domain on Vercel, otherwise the one this request came to. */
async function appAddress(): Promise<string> {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "127.0.0.1:3000";
  const local = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  return `${head.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

export default async function ControlPage() {
  await connection(); // per request (from the cache): the status reads the clock
  const [{ meta }, system, address] = await Promise.all([loadGrid(), loadSystem(), appAddress()]);
  return (
    <>
      <SiteNav meta={meta} system={system} current="control" />
      <main className="cc-page">
        <ControlCenter
          serverNow={new Date().toISOString()}
          syncedAt={meta?.last_synced_at ?? meta?.last_predicted_at ?? null}
          system={system}
          refreshEnabled={Boolean(process.env.GITHUB_TOKEN)}
          app={{ host: new URL(address).host, qr: qrCode(`${address}/`) }}
          extensionDir={process.env.EXTENSION_DIR || null}
          links={{ githubToken: githubTokenUrl(), vercelEnv: VERCEL_ENV_URL }}
        />
      </main>
    </>
  );
}
