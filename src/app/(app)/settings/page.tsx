import type { Metadata } from 'next';
import { ChangePasswordForm } from '@/components/change-password-form';
import { requireSession } from '@/lib/auth/guard';
import { getCredentials } from '@/lib/auth/current';

export const metadata: Metadata = { title: 'Configurações' };

export default async function SettingsPage() {
  await requireSession();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-8 px-6 py-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        </header>
        <ChangePasswordForm available={getCredentials().canChange} />
      </div>
    </div>
  );
}
