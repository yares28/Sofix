/** Layout-only snapshots stay in this tab. Never retain page text, image URLs or player data. */
export type Shape = { x: number; y: number; width: number; height: number; radius: string; kind: "surface" | "ink" };
export type PageGeometry = { className: string; height: number; shapes: Shape[] };

export function navigationKey(url: URL, width: number): string {
  const query = new URLSearchParams(url.search);
  query.sort();
  return `${width}:${url.pathname}?${query}`;
}

export function measurePage(main: HTMLElement): PageGeometry {
  const bounds = main.getBoundingClientRect();
  const shapes: Shape[] = [];
  const add = (rect: DOMRect, kind: Shape["kind"], radius = "5px") => {
    if (rect.width < 2 || rect.height < 2) return;
    shapes.push({ x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height, radius, kind });
  };
  const walk = (element: Element) => {
    if (shapes.length >= 2000 || element.matches("[hidden], script, style, .visually-hidden, [role=tooltip], [role=dialog]")) return;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || style.position === "fixed") return;
    if (element.matches("img, svg, canvas, video, input, select, textarea")) {
      add(rect, "ink", style.borderRadius);
      return;
    }
    // Structural surfaces stay separate from their text/art, so a whole card does not become a grey slab.
    if (style.boxShadow !== "none" || (parseFloat(style.borderRadius) >= 8 && style.backgroundColor !== "rgba(0, 0, 0, 0)")) {
      add(rect, "surface", style.borderRadius);
    }
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const line of range.getClientRects()) add(line, "ink");
      } else if (node instanceof Element) walk(node);
    }
  };
  for (const child of main.children) walk(child);
  return { className: main.className, height: bounds.height, shapes };
}
