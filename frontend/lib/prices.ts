/** The Prices page (/prices): what each card of the gallery cost, what Sorare values it at now, and the difference. */
import type { CollectionCard } from "./play";

export type Priced = CollectionCard & { paid: number; value: number; profit: number; ratio: number };
export type PriceOrder = "gain" | "loss" | "value";

/** Bought cards with a value (the profit), cards you did not buy (crafted, won) with one, and those Sorare does not value. */
export function prices(collection: CollectionCard[]) {
  const bought: Priced[] = [];
  const free: (CollectionCard & { value: number })[] = [];
  let unvalued = 0;
  for (const card of collection) {
    if (typeof card.value !== "number") unvalued += 1;
    else if (typeof card.paid === "number" && card.paid > 0)
      bought.push({ ...card, paid: card.paid, value: card.value, profit: card.value - card.paid, ratio: (card.value - card.paid) / card.paid });
    else free.push({ ...card, value: card.value });
  }
  const paid = bought.reduce((sum, c) => sum + c.paid, 0);
  const worth = bought.reduce((sum, c) => sum + c.value, 0);
  return {
    bought,
    free: free.sort((a, b) => b.value - a.value),
    unvalued,
    paid,
    worth,
    profit: worth - paid,
    up: bought.filter((c) => c.profit > 0).length,
    down: bought.filter((c) => c.profit < 0).length,
    freeWorth: free.reduce((sum, c) => sum + c.value, 0),
  };
}

export function sortPriced(cards: Priced[], order: PriceOrder): Priced[] {
  const by = { gain: (a: Priced, b: Priced) => b.profit - a.profit, loss: (a: Priced, b: Priced) => a.profit - b.profit, value: (a: Priced, b: Priced) => b.value - a.value }[order];
  return [...cards].sort((a, b) => by(a, b) || a.name.localeCompare(b.name));
}

/** "+€6.40", "−€3.10", "€0.00": a signed euro amount with a real minus. */
export function signedEuro(amount: number): string {
  const cents = Math.round(amount * 100) / 100;
  const body = `€${Math.abs(cents).toFixed(2)}`;
  return cents > 0 ? `+${body}` : cents < 0 ? `−${body}` : body;
}

export const euro = (amount: number) => `€${amount.toFixed(2)}`;
