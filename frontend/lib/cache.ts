import { unstable_cache } from "next/cache";

/**
 * Next's data cache, except under `npm run dev`. Production drops it after each refresh (`/api/revalidate`); the dev server keeps
 * its copy on disk for up to an hour and nothing tells it a refresh landed, so localhost showed data from before the last run.
 */
export const cache: typeof unstable_cache = process.env.NODE_ENV === "development" ? (fn) => fn : unstable_cache;
