import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useHref, useLocation } from "react-router-dom";
import { applyDocumentMeta } from "./documentMeta";
import { routeMeta } from "./routeMeta";

const LiveMetaContext = createContext(null);

/**
 * Keeps the document's title, description, canonical address and sharing tags
 * on the screen the visitor is looking at.
 *
 * A screen that learns more than its URL says — the two teams of a match, a
 * team's full name, that ESPN has no such game — reports it with `useLiveMeta`,
 * and the metadata is rewritten with it.
 */
export function RouteMeta({ children }) {
  const { pathname, search } = useLocation();
  // The router base, as the router itself resolves it.
  const base = useHref("/").replace(/\/+$/, "");
  const key = `${pathname}${search}`;
  const [live, setLive] = useState({ key, signature: "" });
  const signature = live.key === key ? live.signature : "";

  const meta = useMemo(
    () => routeMeta(pathname, search, signature ? JSON.parse(signature) : null),
    [pathname, search, signature]
  );

  useEffect(() => {
    applyDocumentMeta(meta, { base });
  }, [meta, base]);

  const publish = useCallback(
    (next) => setLive((current) => (current.key === key && current.signature === next ? current : { key, signature: next })),
    [key]
  );

  return <LiveMetaContext.Provider value={publish}>{children}</LiveMetaContext.Provider>;
}

/**
 * Report what a screen has learned about its own page.
 *
 * @param {object|null} data  `{ name }` for a team or player,
 *   `{ home, away, competition }` for a match, `{ notFound: true }` for a game
 *   ESPN does not know, or null while nothing is known yet
 */
export function useLiveMeta(data) {
  const publish = useContext(LiveMetaContext);
  const signature = data ? JSON.stringify(data) : "";
  useEffect(() => {
    publish?.(signature);
  }, [publish, signature]);
}
