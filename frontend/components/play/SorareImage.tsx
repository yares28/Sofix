import Image from "next/image";

// Card art and club badges come from one host, national-team flags from another. Both are Sorare's, both are
// hot-linked, and the Content-Security-Policy in next.config.ts allows exactly these two.
const SORARE_ORIGINS = ["https://assets.sorare.com/", "https://frontend-assets.sorare.com/"];

/**
 * A picture Sorare hosts: card art, a player's face, a club badge, a national-team flag. Hot-linked, never
 * downloaded or proxied (`unoptimized`), and only from Sorare's own asset hosts — the same rule the club
 * crests follow.
 */
export default function SorareImage({
  src,
  alt = "",
  width,
  height,
  fill = false,
  fit = "cover",
  className,
}: {
  src: string | null | undefined;
  alt?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  /** How the image sits in a `fill` box. Card art uses "contain" so nothing is cropped off the edges. */
  fit?: "cover" | "contain";
  className?: string;
}) {
  if (!src || !SORARE_ORIGINS.some((origin) => src.startsWith(origin))) return null;
  const common = { src, unoptimized: true, loading: "lazy" as const, referrerPolicy: "no-referrer" as const, className };
  return fill ? (
    <Image alt={alt} {...common} fill sizes="120px" style={{ objectFit: fit }} />
  ) : (
    <Image alt={alt} {...common} width={width ?? 48} height={height ?? 48} />
  );
}
