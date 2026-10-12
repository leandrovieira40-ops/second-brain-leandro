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

export interface ShellActions {
  /** Abre o diálogo de nova nota (opcionalmente com título, ex.: a partir de um link quebrado). */
  openNewNote: (initial?: { title?: string }) => void;
  openCapture: () => void;
  favorites: string[];
  toggleFavorite: (path: string) => Promise<void>;
  recents: string[];
  recordRecent: (path: string) => void;
}

const ShellContext = createContext<ShellActions>({
  openNewNote: () => {},
  openCapture: () => {},
  favorites: [],
  toggleFavorite: async () => {},
  recents: [],
  recordRecent: () => {},
});
export const ShellProvider = ShellContext.Provider;
export const useShell = () => useContext(ShellContext);

export function noteHref(path: string): string {
  return `/note?path=${encodeURIComponent(path)}`;
}
