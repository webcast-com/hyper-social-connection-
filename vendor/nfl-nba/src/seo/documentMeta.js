/**
 * Writes one route's metadata into the document.
 *
 * The host that serves the built document writes these tags for the URL that
 * was requested. From then on the app moves between screens without asking the
 * host again, so it keeps them true itself: the tab title, the description, the
 * canonical address and the sharing tags follow every navigation, and a page
 * that turns out not to exist says so to a crawler that runs scripts.
 */
import { documentTitle } from "./routeMeta";

const MANAGED = "data-route-meta";

function upsert(selector, create) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = create();
    node.setAttribute(MANAGED, "");
    document.head.appendChild(node);
  }
  return node;
}

function setMeta(attribute, key, content) {
  const selector = `meta[${attribute}="${key}"]`;
  if (!content) {
    document.head.querySelector(selector)?.remove();
    return;
  }
  upsert(selector, () => {
    const node = document.createElement("meta");
    node.setAttribute(attribute, key);
    return node;
  }).setAttribute("content", content);
}

let publicOrigin = null;

/**
 * The origin canonical addresses are written on. The host's canonical names the
 * public site even when the page is opened on another host (a preview, a
 * deployment alias), so it is read once from there and kept.
 */
function siteOrigin() {
  if (publicOrigin) return publicOrigin;
  const existing = document.head.querySelector('link[rel="canonical"]')?.getAttribute("href");
  try {
    publicOrigin = existing ? new URL(existing).origin : window.location.origin;
  } catch {
    publicOrigin = window.location.origin;
  }
  return publicOrigin;
}

/** For tests: forget the origin read from an earlier document. */
export function resetDocumentMeta() {
  publicOrigin = null;
}

/**
 * @param {object} meta  a `routeMeta()` result
 * @param {{ base?: string }} [options]  the router base ("/nfl-basketball"), without a trailing slash
 */
export function applyDocumentMeta(meta, { base = "" } = {}) {
  if (typeof document === "undefined" || !meta) return;
  const origin = siteOrigin();
  const title = documentTitle(meta);
  const found = meta.status !== 404;
  const path = `${base}${meta.path}`;
  const url = found ? `${origin}${path}` : null;

  document.title = title;
  setMeta("name", "description", meta.description);
  setMeta("name", "keywords", found && meta.index ? [...new Set(meta.keywords)].slice(0, 12).join(", ") : "");
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", meta.description);
  setMeta("property", "og:url", url);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", meta.description);

  if (url) {
    upsert('link[rel="canonical"]', () => {
      const node = document.createElement("link");
      node.setAttribute("rel", "canonical");
      return node;
    }).setAttribute("href", url);
  } else {
    document.head.querySelector('link[rel="canonical"]')?.remove();
  }

  // Only a robots tag this module (or the host, on its behalf) wrote is touched:
  // a host that marks a whole deployment "noindex" keeps its own tag.
  const robots = document.head.querySelector(`meta[name="robots"][${MANAGED}]`);
  if (found && meta.index) {
    robots?.remove();
  } else if (robots) {
    if (!/noindex/i.test(robots.getAttribute("content") ?? "")) robots.setAttribute("content", "noindex, follow");
  } else if (!document.head.querySelector('meta[name="robots"]')) {
    const node = document.createElement("meta");
    node.setAttribute("name", "robots");
    node.setAttribute("content", "noindex, follow");
    node.setAttribute(MANAGED, "");
    document.head.appendChild(node);
  }

  // Structured data describes the page it was served for, not the one the
  // visitor has since moved to.
  document.head.querySelectorAll('script[type="application/ld+json"][data-route]').forEach((node) => {
    if (node.getAttribute("data-route") !== path) node.remove();
  });
}
