import type { MetadataRoute } from 'next';

/** Aplicação privada: nada deve ser indexado. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
