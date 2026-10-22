# ESPN endpoint audit — all configured sports

Audit date: **2026-10-22**. This checks the current application's 38 configured scoreboard routes across seven sports, not every sport/league advertised by ESPN. The odds integration uses 37 of these same routes (all except F1), not a separate Core v2/v3 service.

## Findings and corrections

1. **Two rugby mappings were incorrect.** Premiership Rugby now uses `rugby/267979` rather than `rugby/180659` (Six Nations). Super Rugby Pacific now uses `rugby/242041` rather than `rugby/164205` (Rugby World Cup). The correction is based on the reference's explicit scoreboard examples, not a successful live probe here.
2. All configured sport/league identifiers are present in the reference repository's Core league snapshot. **A Core catalog entry does not prove a Site scoreboard currently works**, and a documented route does not guarantee betting markets.
3. Scores and odds now use one canonical Site v2 URL builder, preserving ESPN provider namespaces: soccer for UI Football, football for American football, hockey for Ice hockey, racing for Motorsport. Core `/leagues/` paths and Site v3 are not substituted into scoreboards.
4. Source reports now include the exact `url`, `httpStatus` and `errorKind` (`http`, `network`, `timeout`, `invalid-response`). A null status means no HTTP response, not HTTP 404. Valid HTTP 200 empty schedules remain healthy. Neither unavailable leagues nor unsupported markets are silently removed.
5. Both pages expose failed-feed diagnostics. An HTTP 404 from the app's own refresh endpoint produces a deployment warning, distinct from a successful app response containing ESPN source 404s. Previous data is retained on app-request failures.

## Live attempt in this sandbox

Checked at `2026-10-22T03:08:59.929Z` using the app's actual HTTPS transport, normal TLS verification, up to eight concurrent requests and bounded retries.

| Sport | Leagues attempted | HTTP responses received | Observed HTTP 404 | Network failures |
|---|---:|---:|---:|---:|
| football | 28 | 0 | 0 | 28 |
| basketball | 4 | 0 | 0 | 4 |
| american-football | 1 | 0 | 0 | 1 |
| baseball | 1 | 0 | 0 | 1 |
| ice-hockey | 1 | 0 | 0 | 1 |
| rugby | 2 | 0 | 0 | 2 |
| motorsport | 1 | 0 | 0 | 1 |

**All 38 requests failed before receiving HTTP headers (`ECONNRESET`).** The sandbox's outbound allowlist excludes ESPN. Zero observed 404s here does not mean these routes are healthy; it means the user's reported 404 cannot be reproduced from this network. No claim of verified live data is made.

## Full route inventory

Every row below had `httpStatus: null`, `errorKind: network`, and `fetch failed: ECONNRESET` in this run. Prefix each path with `https://site.api.espn.com/apis/site/v2/sports/`. Scores and odds share the path; F1 is scores-only. Future-date odds queries append `?dates=YYYYMMDD&limit=100`.

| Sport | App league slug | Scoreboard path |
|---|---|---|
| football | `epl` | `soccer/eng.1/scoreboard` |
| football | `laliga` | `soccer/esp.1/scoreboard` |
| football | `seriea` | `soccer/ita.1/scoreboard` |
| football | `bundesliga` | `soccer/ger.1/scoreboard` |
| football | `ligue1` | `soccer/fra.1/scoreboard` |
| football | `championship` | `soccer/eng.2/scoreboard` |
| football | `eredivisie` | `soccer/ned.1/scoreboard` |
| football | `primeira` | `soccer/por.1/scoreboard` |
| football | `scottish` | `soccer/sco.1/scoreboard` |
| football | `superlig` | `soccer/tur.1/scoreboard` |
| football | `ucl` | `soccer/uefa.champions/scoreboard` |
| football | `uel` | `soccer/uefa.europa/scoreboard` |
| football | `uecl` | `soccer/uefa.europa.conf/scoreboard` |
| football | `wsl` | `soccer/eng.w.1/scoreboard` |
| football | `caf` | `soccer/caf.champions/scoreboard` |
| football | `caf-confed` | `soccer/caf.confed/scoreboard` |
| football | `south-africa` | `soccer/rsa.1/scoreboard` |
| football | `caf-world-cup` | `soccer/fifa.worldq.caf/scoreboard` |
| football | `mls` | `soccer/usa.1/scoreboard` |
| football | `nwsl` | `soccer/usa.nwsl/scoreboard` |
| football | `liga-mx` | `soccer/mex.1/scoreboard` |
| football | `brasileirao` | `soccer/bra.1/scoreboard` |
| football | `argentina` | `soccer/arg.1/scoreboard` |
| football | `libertadores` | `soccer/conmebol.libertadores/scoreboard` |
| football | `jleague` | `soccer/jpn.1/scoreboard` |
| football | `saudi` | `soccer/ksa.1/scoreboard` |
| football | `afc` | `soccer/afc.champions/scoreboard` |
| football | `aleague` | `soccer/aus.1/scoreboard` |
| basketball | `nba` | `basketball/nba/scoreboard` |
| basketball | `wnba` | `basketball/wnba/scoreboard` |
| basketball | `ncaam` | `basketball/mens-college-basketball/scoreboard` |
| basketball | `ncaaw` | `basketball/womens-college-basketball/scoreboard` |
| american-football | `nfl` | `football/nfl/scoreboard` |
| baseball | `mlb` | `baseball/mlb/scoreboard` |
| ice-hockey | `nhl` | `hockey/nhl/scoreboard` |
| rugby | `prem-rugby` | `rugby/267979/scoreboard` |
| rugby | `super-rugby` | `rugby/242041/scoreboard` |
| motorsport | `f1` | `racing/f1/scoreboard` |

A running Next server in database-offline mode also returned **HTTP 200** for `GET /api/sports?refresh=1` (38 failed upstream requests) and `POST /api/sports/predictions?refresh=1` with the rugby filter (two failed upstream requests). Both responses correctly included exact URLs, null upstream HTTP statuses and `network` classifications; no app-route 404 was reproduced locally. The temporary server was stopped.

## Reference evidence (not current availability)

- [Rugby scoreboard IDs](https://github.com/pseudo-r/Public-ESPN-API/blob/3796c6a7c0b0c496c1f62408b0792e23254cd930/docs/sports/rugby.md#example-api-calls): explicit Six Nations/World Cup/Premiership/Super Rugby examples.
- [League catalog snapshot](https://github.com/pseudo-r/Public-ESPN-API/blob/3796c6a7c0b0c496c1f62408b0792e23254cd930/docs/data/leagues.json): identifiers discovered on 2026-09-30, including historical competitions.
- [Recorded live probes](https://github.com/pseudo-r/Public-ESPN-API/blob/3796c6a7c0b0c496c1f62408b0792e23254cd930/docs/data/live-probes.json): on 2026-09-30 the reference recorded HTTP 200 for Site v2 EPL, NBA, NFL, MLB and NHL scoreboards; it recorded HTTP 404 for Site v3 NFL scoreboard. Those five historical successes do not verify all 38 routes or current availability.
- [Core endpoint catalog](https://github.com/pseudo-r/Public-ESPN-API/blob/3796c6a7c0b0c496c1f62408b0792e23254cd930/docs/core-endpoints.md): explicitly warns that advertised routes may be internal, obsolete or sport-specific.

## Deployment versus upstream 404 (historical pre-merge findings)

**Update:** PR #34 was subsequently merged into `main` as `4fd1834`. The missing-route discussion below describes the pre-merge snapshot, not current `main`. The new reports are upstream HTTP 403; see [the access-denial investigation](ESPN_ACCESS_DENIED.md).

At the time of the original audit, GitHub `main` is `b323553d4d1e1e7712f945a1adf80005eb7219e9`; PR #34 is open, with head `ef05195afed192e226caaa197de2fc35b7951a0d` before this audit. The `main` tree contains `/api/sports` but **does not contain `/api/sports/predictions`**. The PR has a successful Vercel preview check, which is not evidence that production runs that commit or that ESPN responds successfully.

- If the browser request to `/api/sports/predictions` itself is HTTP 404, confirm the deployment contains the PR's route. It was absent from the pre-merge `main` snapshot described above. No merge or deployment was performed by this audit.
- If `/api/sports?refresh=1` or `/api/sports/predictions?refresh=1` returns HTTP 200, inspect `sources` for the failing ESPN `url` and `httpStatus`. A source 404 is an upstream problem, not a missing Next.js route.
- `httpStatus: null` with `network`/`timeout` requires network/TLS/egress investigation; changing version numbers or disabling TLS is not a fix.
- HTTP 200 with no fixtures or no usable odds can be valid. Do not replace it with fake live matches/prices.

To pinpoint the reported failure, the exact deployed URL, response status and one failed source entry are still needed. Do not include cookies, authorization headers or secrets.

## Reproduce from the deployment network

```sh
# All 38 scoreboards; prints exact URLs, statuses, per-sport counts and summary:
npm run check:espn
# Machine-readable report (silent suppresses npm's non-JSON preamble):
npm run --silent check:espn -- --json > espn-report.json
# Selected sport or league(s):
npm run check:espn -- --sport rugby
npm run check:espn -- epl nba nfl mlb nhl f1
```

The diagnostic exits nonzero for HTTP errors, network/timeout errors or invalid responses. A legitimate HTTP 200 empty schedule succeeds. It never returns sample data. Run it where ESPN is reachable; the app's odds API is separate and can additionally distinguish market availability.

## Regression checks

**67 unit/API/transport/audit tests and 44 browser fixture tests passed (111 total).** Coverage includes all seven provider namespaces, all 38 score paths, all 37 dated/undated odds paths, rugby mappings, explicit 404 versus reset/invalid-response diagnostics, existing retries/deadlines, and mobile app-route/source-error presentation. TypeScript and changed-file lint/whitespace checks also pass (two standard team-logo image optimization warnings). Mocked tests do not establish live provider availability or deployment correctness.
