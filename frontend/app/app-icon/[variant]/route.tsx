import { ImageResponse } from "next/og";
import { stripeIcon } from "../../../lib/appIcon";

// PNG app icons for the manifest, drawn from the same five difficulty stripes as the favicon (app/icon.svg).
// "any" has rounded corners; "maskable" fills the square so the phone can cut its own shape.
const VARIANTS: Record<string, { size: number; rounded: boolean }> = {
  "any-192": { size: 192, rounded: true },
  "any-512": { size: 512, rounded: true },
  "maskable-512": { size: 512, rounded: false },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  const spec = VARIANTS[variant];
  if (!spec) return new Response("Not found", { status: 404 });
  return new ImageResponse(stripeIcon(spec.size, spec.rounded), { width: spec.size, height: spec.size });
}
