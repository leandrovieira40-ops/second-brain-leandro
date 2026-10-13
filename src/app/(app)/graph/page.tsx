import type { Metadata } from 'next';
import { GraphPage } from '@/components/graph/graph-page';
import { requireSession } from '@/lib/auth/guard';

export const metadata: Metadata = { title: 'Grafo' };

export default async function Graph() {
  await requireSession();
  return <GraphPage />;
}
