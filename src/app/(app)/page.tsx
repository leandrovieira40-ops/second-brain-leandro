import { Dashboard } from '@/components/dashboard';
import { requireSession } from '@/lib/auth/guard';

export default async function HomePage() {
  await requireSession();
  return <Dashboard />;
}
