/**
 * Proteção CSRF para mutações (ADR-0005): além do cookie `SameSite=Lax`, a requisição precisa vir do
 * próprio site — `Sec-Fetch-Site: same-origin` ou cabeçalho `Origin` com o mesmo host.
 */
export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin';

  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function isJsonRequest(request: Request): boolean {
  return (request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json');
}
