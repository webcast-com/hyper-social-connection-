/** React Router must accept the base URL both with and without a trailing slash. */
export function routerBase(baseUrl) {
  return baseUrl.replace(/\/+$/, "") || "/";
}
