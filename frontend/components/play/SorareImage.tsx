import Image from "next/image";

const SORARE_ORIGIN = "https://assets.sorare.com/";

/**
 * A picture Sorare hosts: card art, a player's face, a club badge. Hot-linked, never downloaded or proxied
 * (`unoptimized`), and only from Sorare's own asset host — the same rule the club crests follow.
 */
export default function SorareImage({
  src,
  alt = "",
  width,
  height,
  fill = false,
  className,
}: {
  src: string | null | undefined;
  alt?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
}) {
  if (!src || !src.startsWith(SORARE_ORIGIN)) return null;
  const common = { src, unoptimized: true, loading: "lazy" as const, referrerPolicy: "no-referrer" as const, className };
  return fill ? (
    <Image alt={alt} {...common} fill sizes="120px" style={{ objectFit: "cover" }} />
  ) : (
    <Image alt={alt} {...common} width={width ?? 48} height={height ?? 48} />
  );
}
