# ESPN HTTP 403: access-denial diagnosis

## Current evidence

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

The endpoint paths and existing app User-Agent are unchanged: there is no evidence yet that a particular request header caused the denial. No browser impersonation, cookie copying, arbitrary API key, proxy rotation, alternate-host fallback or TLS disabling was added. These changes improve evidence and presentation; **they do not grant network access or claim to resolve the denial**.

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
