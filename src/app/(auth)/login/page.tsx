import type { Metadata } from 'next';
import { LoginForm } from '@/components/login-form';
import { readAppConfig } from '@/lib/config/env';
import { safeNextPath } from '@/lib/client/safe-next';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { appName } = readAppConfig();
  const { next } = await searchParams;
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{appName}</h1>
          <p className="text-muted-foreground text-sm">
            Acesso privado. Entre com sua frase-senha.
          </p>
        </div>
        <LoginForm next={safeNextPath(next)} />
      </div>
    </main>
  );
}
