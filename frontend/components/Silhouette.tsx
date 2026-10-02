/** A head and shoulders in one colour (the colour is the caller's `fill`): it holds a player's place until his picture is there, and stays when he has none. */
export default function Silhouette({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 70 78" preserveAspectRatio="xMidYMax meet">
      <circle cx="35" cy="25" r="15" />
      <path d="M5 78c2-20 14-31 30-31s28 11 30 31z" />
    </svg>
  );
}
