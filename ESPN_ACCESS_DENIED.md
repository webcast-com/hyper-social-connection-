# ESPN HTTP 403: access-denial diagnosis

**Latest update (2026-10-23):** After the minimal-header change in PR36, the user confirmed that ESPN is responding correctly in their tested environment. The earlier denial evidence below is historical. The exact filtering mechanism and access from other deployments remain unproven.

## Initial evidence (before the minimal-header change)

The user supplied `errorKind: http`, `httpStatus: 403` source reports for multiple unrelated soccer, basketball, NFL and MLB scoreboards and confirmed this occurs in **both the Arena preview and the deployed website**.

That is an access refusal, not a missing Next.js route, a valid empty schedule, or a browser CORS error. ESPN requests happen on the server. Because these calls share `site.api.espn.com`, a shared access policy or request filter is more plausible than all league slugs independently being wrong. **The status alone does not prove whether ESPN, its CDN, or a hosting/egress intermediary issued the response.** It also does not establish that both environments have the same cause.

A fresh direct EPL check from this sandbox, using the current app headers and normal TLS verification, still returned `fetch failed: ECONNRESET` with no HTTP status. The user's production 403 and this local network failure must not be conflated. The sandbox's outbound allowlist excludes ESPN; that fact alone does not explain the deployed website's denial.

## Changes in this branch

- Score and odds HTTP errors now preserve a small allowlist of bounded response metadata:
  - `server` from `Server`;
  - `via` from `Via`;
  - `contentType` from `Content-Type`;
  - `proxyBlockReason` from `X-Mitmproxy-Blocked-Reason`, when explicitly present.
- Header values are control-character sanitized and limited to 160 characters each. Cookies, authorization, arbitrary headers and response bodies are not read into diagnostics, stored in boards or exposed to the browser.
- Error response streams are cancelled. Cleanup failures no longer replace a known HTTP denial with a misleading network classification.
- Both pages show a distinct HTTP 403 access-restriction explanation. Odds distinguish a refused HTTP request from a request that received no response. Expand feed details to see available metadata.
- The all-sport diagnostic now counts `http403` separately from `http404`, network failures and timeouts, in both the summary and per-sport groups.
- No same-request retry is made for 403. Existing cache/poll intervals, score samples (explicitly labeled), and the no-sample-odds policy are unchanged.

The endpoint paths are unchanged. The original diagnostic-only change left request identity unchanged; the subsequent minimal-header change below removes the custom application User-Agent as an unverified request-compatibility adjustment. No browser impersonation, cookie copying, arbitrary API key, proxy rotation, alternate-host fallback or TLS disabling was added. These changes improve evidence and presentation; **they do not grant network access or claim to resolve the denial**.

## Next deployment check

Deploy this branch normally, then refresh once and inspect **one** failed source rather than repeatedly refreshing all leagues:

```text
/api/sports?refresh=1
```

A source may now contain the following additional field (illustrative, not an observed production response):

```json
{
  "httpStatus": 403,
  "errorKind": "http",
  "responseMetadata": {
    "server": "example-edge",
    "via": "1.1 example-proxy",
    "contentType": "text/plain",
    "proxyBlockReason": "OUTBOUND_HOST_DENIED"
  }
}
```

Alternatively, run the diagnostic **from the affected deployment network**:

```sh
npm run --silent check:espn -- epl --json
```

Please share one source's `httpStatus`, `errorKind` and `responseMetadata`, along with which environment produced it. Do not share request cookies, authorization headers, environment secrets or a full denial page.

### Interpreting the evidence

- An explicit intermediary block-reason header is useful evidence for a network-policy investigation. Ask the environment operator whether access to `site.api.espn.com` is permitted, and have them make an authorized configuration change if appropriate. The application cannot change the sandbox's network allowlist.
- A CDN/server name or an HTML content type is a clue, **not proof** that ESPN originated the block or why. The hosting/provider operator may need to examine request logs or confirm access permissions.
- If ESPN requires approval or declines access from the deployment, obtain permitted access or select a licensed alternative. Changing league IDs or version numbers is not a substitute for permission.
- If the metadata is absent or inconclusive, the blocker remains unidentified. Do not label the deployment "fixed" until the same environment returns a valid ESPN HTTP 200 scoreboard. HTTP 200 with no events can still be a healthy schedule response.

## Verification

**72 unit/API/transport/audit tests + 46 sports/homepage browser fixture tests pass (118 total).** New cases verify safe metadata serialization, field allowlisting/bounds, HTTP 403 no-retry behavior, all-sport 403 counts, and narrow-screen score/odds presentation. Existing deadline, retry, 404, no-HTTP, guest navigation and odds-filter/share regressions still pass. TypeScript, changed-file ESLint and whitespace checks pass (two pre-existing team-logo optimization warnings).

These tests use controlled denial responses. No successful live ESPN access, production response provenance, authenticated persistence or production fix is claimed.


## Follow-up: browser succeeds, server denied (2026-10-23)

The user confirms that the exact ESPN URL returns JSON when opened directly in their browser. This narrows the difference to the requests/environments; it does not identify whether the server IP/network, location, TLS/client characteristics, headers, or some other delivery policy is responsible. A browser success is not proof of permitted server-to-server access.

Both score and odds fetches now share a minimal application-supplied header set: `Accept: application/json`. The custom `HyperSports` User-Agent/contact-domain override was removed. Fetch still sends its genuine default runtime User-Agent where applicable; this does not make the request look like Chrome or reproduce the user's browser session. No cookies, Origin, Referer, proxy, alternate host, browser impersonation, or TLS workaround is added. HTTP 403 still is not retried.

**User-confirmed outcome:** The user subsequently reported that ESPN is responding correctly after this change in their tested environment. This confirms their observed recovery, not the precise reason for the original denial or access from every hosting environment. This sandbox still cannot independently verify live ESPN access because its outbound allowlist excludes ESPN. If another deployment receives 403, investigate authorized hosting/provider access rather than changing headers to evade a denial.

The existing score and odds request tests now assert that the full app-supplied header set is exactly the JSON Accept header. Existing denial/no-retry and safe metadata tests remain in place.
