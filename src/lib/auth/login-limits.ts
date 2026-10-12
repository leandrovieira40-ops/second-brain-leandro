import { SlidingWindowLimiter } from './rate-limit';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/** Falhas de login: 5 por IP e 30 no total a cada 15 minutos (por instância). */
export const loginFailuresByIp = new SlidingWindowLimiter(5, FIFTEEN_MINUTES);
export const loginFailuresGlobal = new SlidingWindowLimiter(30, FIFTEEN_MINUTES);
export const GLOBAL_KEY = 'global';

export function clientIp(request: Request): string {
  // Na Vercel, o primeiro IP de x-forwarded-for é definido pela própria plataforma.
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}
