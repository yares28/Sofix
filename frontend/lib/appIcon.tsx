// The app icon: the five difficulty stripes of the favicon (app/icon.svg), easiest green to hardest red.
export const STRIPES = ["#1f7a4f", "#5cc58d", "#e3e3e8", "#ff7b6e", "#c4312a"] as const;

/** JSX for next/og's ImageResponse (flex layout only). */
export function stripeIcon(size: number, rounded: boolean) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        borderRadius: rounded ? size * 0.22 : 0,
        overflow: "hidden",
      }}
    >
      {STRIPES.map((color) => (
        <div key={color} style={{ flex: 1, height: "100%", background: color }} />
      ))}
    </div>
  );
}
