import { NextResponse } from 'next/server';
import { sessionCookieName, sessionCookieOptions } from '@/lib/auth/session';
import { readAuthConfig } from '@/lib/config/env';
import { apiError } from '@/lib/http/errors';
import { isSameOriginRequest } from '@/lib/http/origin';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return apiError(403, 'forbidden_origin', 'Origem não confirmada.');
  const { secureCookie } = readAuthConfig();
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(sessionCookieName(secureCookie), '', sessionCookieOptions(secureCookie, 0));
  return response;
}
