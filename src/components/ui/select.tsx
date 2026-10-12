import type * as React from 'react';
import { cn } from '@/lib/utils';

/** `<select>` nativo estilizado: acessível por teclado e leitores de tela sem JavaScript extra. */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-input [&>option]:bg-card flex h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs disabled:opacity-50 dark:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}
