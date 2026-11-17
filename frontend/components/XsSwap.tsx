import { Fragment, type ReactNode } from "react";
import { XS_VERSIONS, type XsVersion } from "../lib/xs";

/**
 * A card's xS drawn in every version (lib/xs.ts): `render` draws one chip exactly as before and receives the attribute that
 * marks its version; the rule in globals.css shows the picked one. One drawing when every version shows the same number.
 */
export default function XsSwap({ values, render }: {
  values: Record<XsVersion, number | null>;
  render: (n: number | null, mark: { "data-xsv"?: XsVersion }) => ReactNode;
}) {
  const shown = (n: number | null) => (n === null ? null : Math.round(n));
  if (shown(values.v0) === shown(values.v1) && shown(values.v2) === shown(values.v1)) return <>{render(values.v1, {})}</>;
  return <>{XS_VERSIONS.map((v) => <Fragment key={v}>{render(values[v], { "data-xsv": v })}</Fragment>)}</>;
}
