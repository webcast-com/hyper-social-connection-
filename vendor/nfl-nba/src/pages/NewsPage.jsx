import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { detailSport } from "../data/detailConfig";
import { basketballNews, nflNews, demoNewsImages } from "../data/newsData";
import { isEspnDisabled, loadNews } from "../api/espn";
import { EmptyState } from "../components/ui";

function fromEspn(article, fallbackImage) {
  return {
    id: article.id,
    tag: article.tag ?? "ESPN",
    accent: "#8b7cf6",
    title: article.headline,
    summary: article.description ?? "",
    author: article.byline ?? "ESPN",
    published: article.published
      ? new Date(article.published).toLocaleDateString([], { day: "numeric", month: "short" })
      : "",
    readTime: "ESPN",
    image: article.image ?? fallbackImage,
  };
}

/** Card artwork that degrades to the accent gradient when a photo fails. */
function NewsCard({ article }) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(article.image) && !broken;

  return (
    <article className="sh-news-card" style={{ "--news-accent": article.accent }}>
      <div className={`sh-news-media ${showImage ? "has-image" : ""}`}>
        {showImage ? (
          <img
            className="sh-news-img"
            src={article.image}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        ) : null}
        <span className="sh-news-tag">{article.tag}</span>
      </div>
      <div className="sh-news-body">
        <h2 className="sh-news-title">{article.title}</h2>
        <p className="sh-news-summary">{article.summary}</p>
        <div className="sh-news-meta">
          <span>{article.author}</span>
          <span aria-hidden="true">·</span>
          <span>{article.published}</span>
          <span aria-hidden="true">·</span>
          <span>{article.readTime}</span>
        </div>
      </div>
    </article>
  );
}

export default function NewsPage({ sport = "basketball" }) {
  const config = detailSport(sport);
  const demo = sport === "football" ? nflNews : basketballNews;
  const fallbacks = useMemo(() => demoNewsImages[sport] ?? demoNewsImages.basketball, [sport]);
  const [articles, setArticles] = useState(demo);

  useEffect(() => {
    setArticles(demo);
    if (isEspnDisabled()) return undefined;
    let active = true;
    loadNews(config.leagueKey)
      .then((remote) => {
        if (!active || !remote.length) return;
        const live = remote.map((article, index) =>
          fromEspn(article, fallbacks[index % fallbacks.length])
        );
        setArticles([...live, ...demo]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [config.leagueKey, demo, fallbacks]);

  return (
    <main className="sh-detail">
      <header className="sh-page-head">
        <span className="sh-detail-kicker">{config.hubLabel} newsroom</span>
        <h1 className="sh-detail-title">Latest news</h1>
        <p className="sh-page-sub">
          Match reports, previews and analysis from across the {config.label}.
        </p>
      </header>

      {articles.length ? (
        <div className="sh-news-grid">
          {articles.map((article) => (
            <NewsCard article={article} key={article.id ?? article.title} />
          ))}
        </div>
      ) : (
        <EmptyState title="No stories yet" hint="News arrives with the next feed refresh." />
      )}

      <p className="sh-detail-note">
        Previews and reports are bundled with the app for offline use.{" "}
        <Link to={config.hub}>Back to the {config.hubLabel} hub</Link>
      </p>
    </main>
  );
}
