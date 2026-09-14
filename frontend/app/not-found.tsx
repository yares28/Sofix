import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <section className="card empty-state">
        <h1>Not found</h1>
        <p>That page or team isn’t part of this season’s LaLiga.</p>
        <Link href="/" className="primary-button">
          Back to all fixtures
        </Link>
      </section>
    </main>
  );
}
