import React from "react";
import { Link } from "react-router-dom";

/**
 * An address with no screen behind it. The host answers such an address with a
 * 404, and the app says the same thing instead of quietly showing the
 * basketball scores under a URL that names something else.
 */
export default function NotFoundPage() {
  return (
    <main className="sh-coming">
      <section className="sh-coming-card">
        <span className="sh-coming-badge">404</span>
        <h1>Page not found</h1>
        <p>There is no page at this address. The live scores are one tap away.</p>
        <Link to="/basketball" className="sh-coming-link">
          Basketball scores
        </Link>{" "}
        <Link to="/nfl" className="sh-coming-link">
          NFL scores
        </Link>
      </section>
    </main>
  );
}
