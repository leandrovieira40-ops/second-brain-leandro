'use client';

import { Button } from '@/components/ui/button';

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-lg space-y-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Algo deu errado ao carregar esta página</h1>
      <p className="text-muted-foreground text-sm">
        Nenhuma alteração confirmada foi perdida. Rascunhos não sincronizados continuam guardados
        neste navegador.
      </p>
      <Button onClick={reset}>Tentar de novo</Button>
    </div>
  );
}
