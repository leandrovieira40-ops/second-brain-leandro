'use client';

import {
  HomeIcon,
  LogOutIcon,
  MenuIcon,
  NetworkIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  StarIcon,
  SunIcon,
  TagIcon,
  Trash2Icon,
  ZapIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, logout, setFavorite } from '@/lib/client/api';
import { clearAllDrafts, listDraftPaths } from '@/lib/editor/drafts';
import { clearRecents, loadRecents, pushRecent, renameRecent } from '@/lib/editor/recents';
import { noteName } from '@/lib/vault/paths';
import { cn } from '@/lib/utils';
import { CaptureDialog } from './capture-dialog';
import { FileTree } from './file-tree';
import { NewNoteDialog } from './new-note-dialog';
import { SearchDialog } from './search-dialog';
import { TagPane } from './tag-pane';
import {
  noteHref,
  ShellProvider,
  VaultProvider,
  type ShellActions,
  type VaultInfo,
} from './vault-context';

export function AppShell({
  appName,
  vault,
  vaultLabel,
  initialFavorites,
  children,
}: {
  appName: string;
  vault: VaultInfo;
  vaultLabel: string;
  initialFavorites: string[];
  children: React.ReactNode;
}) {
  const vaultError = vault.error;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activePath = pathname === '/note' ? searchParams.get('path') : null;
  const [filter, setFilter] = useState('');
  const [newNote, setNewNote] = useState<{ open: boolean; title: string; key: number }>({
    open: false,
    title: '',
    key: 0,
  });
  const [captureOpen, setCaptureOpen] = useState(false);
  const [flash, setFlash] = useState<{ text: string; href?: string } | null>(null);
  const [search, setSearch] = useState({ open: false, key: 0 });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage só existe no cliente */
    setRecents(loadRecents());
    // Marca que a interface está interativa (atalhos de teclado ativos) — usado pelos testes E2E.
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const openNewNote = useCallback((initial?: { title?: string }) => {
    setNewNote((current) => ({ open: true, title: initial?.title ?? '', key: current.key + 1 }));
  }, []);

  const openSearch = useCallback(() => {
    setSearch((current) => (current.open ? current : { open: true, key: current.key + 1 }));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === 'KeyN') {
        event.preventDefault();
        openNewNote();
      } else if (event.code === 'KeyC') {
        event.preventDefault();
        setCaptureOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openNewNote, openSearch]);

  const shell = useMemo<ShellActions>(
    () => ({
      openNewNote,
      openCapture: () => setCaptureOpen(true),
      favorites,
      toggleFavorite: async (path: string) => {
        setFavoriteError(null);
        try {
          const result = await setFavorite(path, !favorites.includes(path));
          setFavorites(result.notes);
        } catch (error) {
          setFavoriteError(
            error instanceof ApiError ? error.message : 'Sem conexão: favorito não alterado.',
          );
        }
      },
      recents,
      recordRecent: (path: string) => setRecents(pushRecent(path)),
      openSearch,
      notify: (text: string, href?: string) => setFlash({ text, href }),
      notePathChanged: (from: string, to: string) => {
        // O servidor já atualizou o arquivo de favoritos no mesmo commit da renomeação.
        setFavorites((current) => current.map((path) => (path === from ? to : path)));
        setRecents(renameRecent(from, to));
      },
    }),
    [openNewNote, openSearch, favorites, recents],
  );

  const existing = useMemo(() => new Set(vault.tree.notes), [vault.tree.notes]);
  const closeMobile = () => setMobileOpen(false);

  return (
    <VaultProvider value={vault}>
      <ShellProvider value={shell}>
        <div className="flex h-svh overflow-hidden" data-shell-ready={ready ? 'true' : 'false'}>
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
              onClick={closeMobile}
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
                onClick={closeMobile}
              >
                {appName}
              </Link>
              <div className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => setCaptureOpen(true)}
                  aria-label="Captura rápida (Alt+C)"
                  title="Captura rápida (Alt+C)"
                >
                  <ZapIcon />
                </Button>
                <Button
                  size="icon-sm"
                  onClick={() => openNewNote()}
                  aria-label="Nova nota (Alt+N)"
                  title="Nova nota (Alt+N)"
                >
                  <PlusIcon />
                </Button>
              </div>
            </div>
            <div className="px-2 pb-1">
              <button
                type="button"
                onClick={() => {
                  closeMobile();
                  openSearch();
                }}
                className="text-muted-foreground hover:bg-muted flex h-8 w-full items-center gap-2 rounded-md border px-2 text-sm"
                aria-label="Buscar (Ctrl+K)"
              >
                <SearchIcon className="size-4" />
                <span className="flex-1 text-left">Buscar</span>
                <kbd className="text-xs opacity-70">Ctrl+K</kbd>
              </button>
            </div>
            <nav className="space-y-0.5 px-2 pb-2" aria-label="Atalhos">
              <SidebarLink
                href="/"
                active={pathname === '/'}
                onClick={closeMobile}
                icon={<HomeIcon />}
              >
                Início
              </SidebarLink>
              <SidebarLink
                href="/graph"
                active={pathname === '/graph'}
                onClick={closeMobile}
                icon={<NetworkIcon />}
              >
                Grafo
              </SidebarLink>
              <SidebarLink
                href="/tags"
                active={pathname === '/tags'}
                onClick={closeMobile}
                icon={<TagIcon />}
              >
                Tags
              </SidebarLink>
              <SidebarLink
                href="/trash"
                active={pathname === '/trash'}
                onClick={closeMobile}
                icon={<Trash2Icon />}
              >
                Lixeira{vault.tree.trashCount ? ` (${vault.tree.trashCount})` : ''}
              </SidebarLink>
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {favorites.length > 0 ? (
                <NoteGroup title="Favoritos" icon={<StarIcon />}>
                  {favorites.map((path) => (
                    <QuickLink
                      key={path}
                      path={path}
                      exists={existing.has(path)}
                      active={path === activePath}
                      onClick={closeMobile}
                    />
                  ))}
                </NoteGroup>
              ) : null}
              {favoriteError ? (
                <p role="alert" className="text-destructive px-2 pb-2 text-xs">
                  {favoriteError}
                </p>
              ) : null}
              {recents.length > 0 ? (
                <NoteGroup
                  title="Recentes neste navegador"
                  action={
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                      onClick={() => {
                        clearRecents();
                        setRecents([]);
                      }}
                    >
                      limpar
                    </button>
                  }
                >
                  {recents.slice(0, 5).map((path) => (
                    <QuickLink
                      key={path}
                      path={path}
                      exists={existing.has(path)}
                      active={path === activePath}
                      onClick={closeMobile}
                    />
                  ))}
                </NoteGroup>
              ) : null}

              <div className="px-1 pt-1 pb-2">
                <Input
                  type="search"
                  placeholder="Filtrar por nome ou pasta"
                  aria-label="Filtrar notas por nome ou pasta"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="h-8"
                />
              </div>
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
                  onNavigate={closeMobile}
                />
              )}
              <TagPane
                activeTag={pathname === '/tags' ? searchParams.get('tag') : null}
                onNavigate={closeMobile}
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
              <span className="text-muted-foreground truncate text-xs" title={vaultLabel}>
                {vaultLabel}
              </span>
              <div className="flex items-center">
                <Link
                  href="/settings"
                  onClick={closeMobile}
                  aria-label="Configurações"
                  title="Configurações"
                  className="hover:bg-muted inline-flex size-8 items-center justify-center rounded-md [&_svg]:size-4"
                >
                  <SettingsIcon />
                </Link>
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
            {flash ? (
              <p
                role="status"
                className="bg-accent text-accent-foreground flex items-center gap-2 border-b px-4 py-2 text-sm"
              >
                <span className="flex-1">
                  {flash.text}{' '}
                  {flash.href ? (
                    <Link
                      href={flash.href}
                      className="underline underline-offset-2"
                      onClick={() => setFlash(null)}
                    >
                      Abrir
                    </Link>
                  ) : null}
                </span>
                <button type="button" className="text-xs underline" onClick={() => setFlash(null)}>
                  Fechar
                </button>
              </p>
            ) : null}
            <main id="conteudo" className="min-h-0 flex-1 overflow-hidden">
              {children}
            </main>
          </div>
        </div>
        <NewNoteDialog
          key={newNote.key}
          open={newNote.open}
          initialTitle={newNote.title}
          onOpenChange={(open) => setNewNote((current) => ({ ...current, open }))}
        />
        <CaptureDialog
          open={captureOpen}
          onOpenChange={setCaptureOpen}
          onCaptured={(path, href) => setFlash({ text: `Capturado em ${path}.`, href })}
        />
        <SearchDialog
          key={search.key}
          open={search.open}
          onOpenChange={(open) => setSearch((current) => ({ ...current, open }))}
        />
      </ShellProvider>
    </VaultProvider>
  );
}

function SidebarLink({
  href,
  active,
  onClick,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-sm [&_svg]:size-4',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {icon} {children}
    </Link>
  );
}

function NoteGroup({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="pb-3" aria-label={title}>
      <h2 className="text-muted-foreground flex items-center justify-between gap-2 px-2 pb-1 text-xs font-semibold tracking-wide uppercase [&_svg]:size-3.5">
        <span className="flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {action}
      </h2>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

function QuickLink({
  path,
  exists,
  active,
  onClick,
}: {
  path: string;
  exists: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      {exists ? (
        <Link
          href={noteHref(path)}
          onClick={onClick}
          aria-current={active ? 'page' : undefined}
          title={path}
          className={cn(
            'hover:bg-muted block truncate rounded px-2 py-1 text-sm',
            active && 'bg-accent text-accent-foreground font-medium',
          )}
        >
          {noteName(path)}
        </Link>
      ) : (
        <span
          className="text-muted-foreground block truncate px-2 py-1 text-sm line-through"
          title={`${path} (não existe mais)`}
        >
          {noteName(path)}
        </span>
      )}
    </li>
  );
}

const subscribeNothing = () => () => {};

function ThemeToggle() {
  const { theme: storedTheme, setTheme } = useTheme();
  // O tema escolhido só é conhecido no navegador: no servidor (e na hidratação) o botão é neutro.
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const theme = hydrated ? storedTheme : undefined;
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
    clearRecents();
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
