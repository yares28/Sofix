import { SOURCE_NAME, SOURCE_SHORT, type StartSource } from "../lib/play";

/**
 * The small mark that says whose number a start chance is: a filled dot for FF, a ring for SO, a dashed ring for SF. The
 * letters are in the tooltip and the accessible name, so nothing has to be read to tell the marks apart.
 */
export default function SourceMark({ source, className = "" }: { source: StartSource; className?: string }) {
  return (
    <span
      className={`src-mark ${className}`.trim()}
      data-source={source}
      role="img"
      aria-label={SOURCE_SHORT[source]}
      title={`${SOURCE_SHORT[source]}: ${SOURCE_NAME[source]}`}
    />
  );
}
