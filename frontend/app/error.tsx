"use client";

import { useEffect } from "react";

/** Unexpected rendering errors: a friendly message and a retry, never the error details. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The digest matches the server log entry; the message itself stays out of the page.
    console.error("[board] render failed", error.digest ?? error.name);
  }, [error]);

  return (
    <main>
      <section className="card empty-state" role="alert">
        <h1>Something went wrong</h1>
        <p>The board couldn’t be displayed. Your pins and settings are kept.</p>
        <button type="button" className="primary-button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
