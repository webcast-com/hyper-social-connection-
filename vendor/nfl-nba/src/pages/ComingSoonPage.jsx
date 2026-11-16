import React from "react";
import { Link } from "react-router-dom";

export default function ComingSoonPage({ sport }) {
  return (
    <main className="sh-coming">
      <section className="sh-coming-card">
        <span className="sh-coming-badge">{sport}</span>
        <h1>{sport} coverage is coming soon</h1>
        <p>
          ScoreHub currently ships live ESPN data for basketball and the NFL. This tab is
          reserved for the next feed.
        </p>
        <Link to="/basketball" className="sh-coming-link">
          Back to Basketball
        </Link>
      </section>
    </main>
  );
}
