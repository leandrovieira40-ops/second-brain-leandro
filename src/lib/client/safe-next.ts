/** Aceita apenas destinos relativos ao próprio site (evita redirecionamento aberto após o login). */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return '/';
  try {
    const url = new URL(value, 'http://interno');
    return url.origin === 'http://interno' ? `${url.pathname}${url.search}` : '/';
  } catch {
    return '/';
  }
}
