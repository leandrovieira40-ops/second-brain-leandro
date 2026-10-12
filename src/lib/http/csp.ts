/** Content-Security-Policy por requisição (SECURITY.md §3). */
export function contentSecurityPolicy({
  nonce,
  dev,
  https,
}: {
  nonce: string;
  dev: boolean;
  https: boolean;
}) {
  return [
    "default-src 'self'",
    // 'strict-dynamic': só scripts com nonce (e os que eles carregam) executam.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // O CodeMirror injeta estilos em tempo de execução; com nonce aqui, 'unsafe-inline' seria ignorado.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
