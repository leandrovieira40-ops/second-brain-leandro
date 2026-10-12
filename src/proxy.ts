import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName, verifySessionToken } from '@/lib/auth/session';
import { ConfigError, readAuthConfig } from '@/lib/config/env';
import { contentSecurityPolicy } from '@/lib/http/csp';

/**
 * Primeira linha de defesa (ADR-0005): gera o nonce da CSP e bloqueia qualquer rota sem sessão
 * válida. Páginas e Route Handlers verificam a sessão novamente — o proxy não é a única barreira.
 */
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  '/robots.txt',
]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const https =
    request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const csp = contentSecurityPolicy({ nonce, dev: process.env.NODE_ENV === 'development', https });

  let authenticated = false;
  try {
    const config = readAuthConfig();
    const token = request.cookies.get(sessionCookieName(config.secureCookie))?.value;
    authenticated = (await verifySessionToken(token, config)) !== null;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    // Só nomes de variáveis (já públicos no .env.example), nunca valores.
    return withHeaders(
      new NextResponse(`Aplicação não configurada. ${error.message}. Veja docs/DEPLOYMENT.md.`, {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
      csp,
    );
  }

  if (!authenticated && !PUBLIC_PATHS.has(pathname)) {
    if (pathname.startsWith('/api/')) {
      return withHeaders(
        NextResponse.json(
          {
            error: {
              code: 'unauthenticated',
              message: 'Sessão ausente ou expirada. Entre novamente.',
            },
          },
          { status: 401 },
        ),
        csp,
      );
    }
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`);
    return withHeaders(NextResponse.redirect(login), csp);
  }

  if (authenticated && pathname === '/login') {
    return withHeaders(NextResponse.redirect(new URL('/', request.url)), csp);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  return withHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

function withHeaders(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  // Conteúdo pessoal: nunca em caches compartilhados.
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
