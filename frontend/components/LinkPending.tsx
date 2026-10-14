"use client";

import { useLinkStatus } from "next/link";

/**
 * Inside a bar link: there while the link's page is on its way, so the tap shows at once instead of after the server has
 * rendered the whole page. The bar's CSS gives the link the current look (`a:has(.link-pending)`); nothing else changes.
 */
export default function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="link-pending" hidden /> : null;
}
