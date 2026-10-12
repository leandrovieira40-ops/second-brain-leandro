'use client';

import { createContext, useContext } from 'react';
import type { VaultTree } from '@/lib/services/notes';

export interface VaultInfo {
  tree: VaultTree;
  storeKind: 'github' | 'fs' | 'memory';
  timeZone: string;
  /** Mensagem segura quando o vault não pôde ser lido (configuração, rede, permissões). */
  error: string | null;
}

const VaultContext = createContext<VaultInfo | null>(null);

export const VaultProvider = VaultContext.Provider;

export function useVault(): VaultInfo {
  const value = useContext(VaultContext);
  if (!value) throw new Error('useVault fora do VaultProvider');
  return value;
}

const ShellContext = createContext<{ openNewNote: () => void }>({ openNewNote: () => {} });
export const ShellProvider = ShellContext.Provider;
export const useShell = () => useContext(ShellContext);

export function noteHref(path: string): string {
  return `/note?path=${encodeURIComponent(path)}`;
}
