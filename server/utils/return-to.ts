// Only these exact internal paths may be used as post-login destinations.
// Matching is by equality against this list (never by prefix or URL parsing),
// so external hosts, protocol-relative URLs and encoded tricks cannot pass.
export const RETURN_TO_COOKIE = 'leo_return_to'
export const DEFAULT_RETURN_TO = '/admin'
const ALLOWED_RETURN_PATHS: readonly string[] = ['/lecturas', '/admin']

export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && ALLOWED_RETURN_PATHS.includes(value) ? value : DEFAULT_RETURN_TO
}
