'use client';

import { ChevronRightIcon, FileTextIcon, FolderIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { folderDisplay } from '@/lib/notes/folders';
import { noteName } from '@/lib/vault/paths';
import { cn } from '@/lib/utils';
import { noteHref } from './vault-context';

interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  notes: string[];
}

function buildTree(folders: string[], notes: string[]): FolderNode {
  const root: FolderNode = { name: '', path: '', folders: [], notes: [] };
  const index = new Map<string, FolderNode>([['', root]]);
  const ensure = (path: string): FolderNode => {
    const existing = index.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf('/');
    const parent = ensure(slash === -1 ? '' : path.slice(0, slash));
    const node: FolderNode = { name: path.slice(slash + 1), path, folders: [], notes: [] };
    parent.folders.push(node);
    index.set(path, node);
    return node;
  };
  for (const folder of folders) ensure(folder);
  for (const note of notes) {
    const slash = note.lastIndexOf('/');
    ensure(slash === -1 ? '' : note.slice(0, slash)).notes.push(note);
  }
  return root;
}

const OPEN_KEY = 'sb:tree:open';

function loadOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function FileTree({
  folders,
  notes,
  activePath,
  filter,
  onNavigate,
}: {
  folders: string[];
  notes: string[];
  activePath: string | null;
  filter: string;
  onNavigate?: () => void;
}) {
  const root = useMemo(() => buildTree(folders, notes), [folders, notes]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const stored = loadOpen();
    // Pastas da nota ativa ficam sempre abertas.
    if (activePath)
      for (let i = activePath.indexOf('/'); i !== -1; i = activePath.indexOf('/', i + 1))
        stored.add(activePath.slice(0, i));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- estado vem do localStorage, só disponível no cliente
    setOpen(stored);
  }, [activePath]);

  const toggle = (path: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // Preferência apenas visual; sem armazenamento, a árvore só não lembra o estado.
      }
      return next;
    });
  };

  const query = filter.trim().toLocaleLowerCase('pt-BR');
  if (query) {
    const matches = notes.filter((note) => note.toLocaleLowerCase('pt-BR').includes(query));
    return (
      <ul className="space-y-0.5" aria-label="Notas filtradas">
        {matches.length === 0 ? (
          <li className="text-muted-foreground px-2 py-1 text-sm">
            Nenhuma nota com esse nome ou pasta.
          </li>
        ) : (
          matches.map((note) => (
            <li key={note}>
              <NoteLink
                path={note}
                active={note === activePath}
                showFolder
                onNavigate={onNavigate}
              />
            </li>
          ))
        )}
      </ul>
    );
  }

  return (
    <FolderList
      node={root}
      open={open}
      toggle={toggle}
      activePath={activePath}
      depth={0}
      onNavigate={onNavigate}
    />
  );
}

function FolderList({
  node,
  open,
  toggle,
  activePath,
  depth,
  onNavigate,
}: {
  node: FolderNode;
  open: Set<string>;
  toggle: (path: string) => void;
  activePath: string | null;
  depth: number;
  onNavigate?: () => void;
}) {
  const byName = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
  return (
    <ul className="space-y-0.5" role={depth === 0 ? 'tree' : 'group'}>
      {[...node.folders]
        .sort((a, b) => byName(a.name, b.name))
        .map((folder) => {
          const expanded = open.has(folder.path);
          return (
            <li key={folder.path} role="treeitem" aria-expanded={expanded} aria-selected={false}>
              <button
                type="button"
                onClick={() => toggle(folder.path)}
                className="hover:bg-muted flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                <ChevronRightIcon
                  className={cn('size-3.5 shrink-0 transition-transform', expanded && 'rotate-90')}
                />
                <FolderIcon className="text-muted-foreground size-4 shrink-0" />
                <FolderName path={folder.path} name={folder.name} />
              </button>
              {expanded ? (
                <FolderList
                  node={folder}
                  open={open}
                  toggle={toggle}
                  activePath={activePath}
                  depth={depth + 1}
                  onNavigate={onNavigate}
                />
              ) : null}
            </li>
          );
        })}
      {[...node.notes].sort(byName).map((note) => (
        <li key={note} role="treeitem" aria-selected={note === activePath}>
          <NoteLink
            path={note}
            active={note === activePath}
            indent={depth * 12 + 26}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  );
}

function NoteLink({
  path,
  active,
  indent = 8,
  showFolder = false,
  onNavigate,
}: {
  path: string;
  active: boolean;
  indent?: number;
  showFolder?: boolean;
  onNavigate?: () => void;
}) {
  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  return (
    <Link
      href={noteHref(path)}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'hover:bg-muted flex items-center gap-1.5 rounded px-2 py-1 text-sm',
        active && 'bg-accent text-accent-foreground hover:bg-accent font-medium',
      )}
      style={{ paddingLeft: `${indent}px` }}
      title={path}
    >
      <FileTextIcon className="text-muted-foreground size-4 shrink-0" />
      <span className="min-w-0 truncate">
        {noteName(path)}
        {showFolder && folder ? (
          <span className="text-muted-foreground ml-1.5 text-xs">{folder}</span>
        ) : null}
      </span>
    </Link>
  );
}

function FolderName({ path, name }: { path: string; name: string }) {
  const display = folderDisplay(path);
  const friendly = display.label !== name;
  return (
    <span
      className="truncate"
      title={[display.hint, friendly ? `Pasta: ${path}` : null].filter(Boolean).join(' · ') || path}
    >
      {friendly ? (
        <>
          <span aria-hidden className="mr-1">
            {display.icon}
          </span>
          {display.label}
        </>
      ) : (
        name
      )}
    </span>
  );
}
