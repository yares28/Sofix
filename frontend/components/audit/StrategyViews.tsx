import Link from "../navigation/NavigationLink";
import LinkPending from "../LinkPending";

export default function StrategyViews({ plansHref, resultsHref = "/audit/strategies", plans = false }: { plansHref: string; resultsHref?: string; plans?: boolean }) {
  return <nav className="sc-views" aria-label="Strategies view">
    <Link href={resultsHref} aria-current={plans ? undefined : "page"} prefetch={false}>Results<LinkPending /></Link>
    <Link href={plansHref} aria-current={plans ? "page" : undefined} prefetch={false}>Plans<LinkPending /></Link>
  </nav>;
}
