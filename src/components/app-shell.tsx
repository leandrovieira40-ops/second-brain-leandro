'use client';

import {
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logout } from '@/lib/client/api';
import { clearAllDrafts, listDraftPaths } from '@/lib/editor/drafts';
import { cn } from '@/lib/utils';
import { FileTree } from './file-tree';
import { NewNoteDialog } from './new-note-dialog';
import { ShellProvider, VaultProvider, type VaultInfo } from './vault-context';

export function AppShell({
  appName,
  vault,
  vaultLabel,
  children,
}: {
  appName: string;
  vault: VaultInfo;
  vaultLabel: string;
  children: React.ReactNode;
}) {
  const vaultError = vault.error;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activePath = pathname === '/note' ? searchParams.get('path') : null;
  const [filter, setFilter] = useState('');
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyN') {
        event.preventDefault();
        setNewNoteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <VaultProvider value={vault}>
      <ShellProvider value={{ openNewNote: () => setNewNoteOpen(true) }}>
        <div className="flex h-svh overflow-hidden">
          <a
            href="#conteudo"
            className="bg-primary text-primary-foreground sr-only z-50 rounded px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            Pular para o conteúdo
          </a>
          {mobileOpen ? (
            <button
              type="button"
              aria-label="Fechar menu"
              className="fixed inset-0 z-30 bg-black/30 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
          ) : null}
          <aside
            className={cn(
              'bg-sidebar fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r transition-transform md:static md:translate-x-0',
              mobileOpen ? 'translate-x-0' : '-translate-x-full',
            )}
            aria-label="Navegação do vault"
          >
            <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
              <Link
                href="/"
                className="truncate text-base font-semibold tracking-tight"
                onClick={() => setMobileOpen(false)}
              >
                {appName}
              </Link>
              <Button
                size="icon-sm"
                onClick={() => setNewNoteOpen(true)}
                aria-label="Nova nota (Alt+N)"
                title="Nova nota (Alt+N)"
              >
                <PlusIcon />
              </Button>
            </div>
            <nav className="px-2 pb-2">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                aria-current={pathname === '/' ? 'page' : undefined}
                className={cn(
                  'hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-sm',
                  pathname === '/' && 'bg-accent text-accent-foreground',
                )}
              >
                <HomeIcon className="size-4" /> Início
              </Link>
            </nav>
            <div className="px-3 pb-2">
              <Input
                type="search"
                placeholder="Filtrar por nome ou pasta"
                aria-label="Filtrar notas por nome ou pasta"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="h-8"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {vaultError ? (
                <p className="text-destructive px-2 text-sm" role="alert">
                  {vaultError}
                </p>
              ) : vault.tree.notes.length === 0 && vault.tree.folders.length === 0 ? (
                <p className="text-muted-foreground px-2 text-sm">
                  O vault está vazio. Crie a primeira nota com o botão +.
                </p>
              ) : (
                <FileTree
                  folders={vault.tree.folders}
                  notes={vault.tree.notes}
                  activePath={activePath}
                  filter={filter}
                  onNavigate={() => setMobileOpen(false)}
                />
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <span className="text-muted-foreground truncate text-xs" title={vaultLabel}>
                {vaultLabel}
              </span>
              <div className="flex items-center">
                <ThemeToggle />
                <LogoutButton />
              </div>
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menu"
              >
                <MenuIcon />
              </Button>
              <span className="truncate text-sm font-medium">{appName}</span>
            </div>
            <main id="conteudo" className="min-h-0 flex-1 overflow-hidden">
              {children}
            </main>
          </div>
        </div>
        <NewNoteDialog open={newNoteOpen} onOpenChange={setNewNoteOpen} />
      </ShellProvider>
    </VaultProvider>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const label =
    { light: 'Tema: claro', dark: 'Tema: escuro', system: 'Tema: do sistema' }[theme ?? 'system'] ??
    'Tema';
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={() => setTheme(next)}
      aria-label={`${label}. Alternar.`}
      title={label}
    >
      {theme === 'light' ? <SunIcon /> : theme === 'dark' ? <MoonIcon /> : <MonitorIcon />}
    </Button>
  );
}

function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function onClick() {
    if (listDraftPaths().length > 0) {
      const ok = window.confirm(
        'Há alterações ainda não sincronizadas guardadas neste navegador. Sair vai apagá-las. Continuar?',
      );
      if (!ok) return;
    }
    setPending(true);
    try {
      await logout();
    } catch {
      setPending(false);
      window.alert('Não foi possível sair agora (sem conexão).');
      return;
    }
    clearAllDrafts();
    router.replace('/login');
    router.refresh();
  }
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={onClick}
      disabled={pending}
      aria-label="Sair"
      title="Sair"
    >
      <LogOutIcon />
    </Button>
  );
}
