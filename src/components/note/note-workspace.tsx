'use client';

import {
  Columns2Icon,
  EyeIcon,
  FolderInputIcon,
  PanelRightIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  ApiError,
  createConflictCopy,
  readNote,
  restoreVersion,
  saveNote,
  trashNote,
  type CommitDto,
  type NoteDto,
} from '@/lib/client/api';
import { loadDraft, removeDraft, saveDraft, type Draft } from '@/lib/editor/drafts';
import { parseNote } from '@/lib/notes/parse';
import { LinkResolver } from '@/lib/notes/resolve';
import { cn } from '@/lib/utils';
import { noteHref, useShell, useVault } from '../vault-context';
import { createEditorSession } from './editor-session';
import { MarkdownPreview } from './markdown-preview';
import { NoteBacklinks } from './note-backlinks';
import { NoteDetails } from './note-details';
import { NoteHistory } from './note-history';
import { RenameDialog, type RenameOutcome } from './rename-dialog';
import { SaveStatus } from './save-status';

const MarkdownEditor = dynamic(() => import('./markdown-editor'), {
  ssr: false,
  loading: () => <p className="text-muted-foreground px-6 py-6 text-sm">Carregando editor…</p>,
});

type ViewMode = 'edit' | 'split' | 'preview';
const VIEW_KEY = 'sb:view-mode';

export function NoteWorkspace({ note }: { note: NoteDto }) {
  const router = useRouter();
  const { tree, timeZone, storeKind } = useVault();
  const { openNewNote, favorites, toggleFavorite, recordRecent, notify, notePathChanged } =
    useShell();
  const favorite = favorites.includes(note.path);
  const [content, setContent] = useState(note.content);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<{ text: string; href?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ViewMode>('edit');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  const [session] = useState(() => createEditorSession(note, timeZone));
  const { controller } = session;
  const replaceEditor = useCallback(
    (text: string) => {
      session.replace(text);
      setContent(text);
    },
    [session],
  );
  const onEditorChange = useCallback(
    (value: string) => {
      setContent(value);
      controller.edit(value);
    },
    [controller],
  );
  const subscribe = useMemo(() => controller.subscribe.bind(controller), [controller]);
  const getState = useMemo(() => controller.getState.bind(controller), [controller]);
  const state = useSyncExternalStore(subscribe, getState, getState);

  // Preferências visuais e rascunho pendente (somente no cliente).
  useEffect(() => {
    let preferred: ViewMode | null = null;
    try {
      preferred = localStorage.getItem(VIEW_KEY) as ViewMode | null;
    } catch {
      preferred = null;
    }
    const wide = window.matchMedia('(min-width: 1280px)').matches;
    /* eslint-disable react-hooks/set-state-in-effect -- dados do navegador, inexistentes no servidor */
    setMode(
      preferred === 'edit' || preferred === 'split' || preferred === 'preview'
        ? preferred
        : wide
          ? 'split'
          : 'edit',
    );
    setDetailsOpen(wide);
    const draft = loadDraft(note.path);
    if (draft && draft.content !== note.content) setPendingDraft(draft);
    else if (draft) removeDraft(note.path);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [note.path, note.content]);

  // Sugestões de [[links]] acompanham a árvore; a nota entra nas recentes deste navegador.
  useEffect(() => session.setNotePaths(tree.notes), [session, tree.notes]);
  useEffect(() => recordRecent(note.path), [note.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rascunho local a cada alteração não confirmada.
  useEffect(() => {
    if (pendingDraft) return; // editor bloqueado até decidir sobre o rascunho antigo
    if (!state.unsaved) return;
    const id = setTimeout(
      () =>
        saveDraft({
          path: note.path,
          content: controller.getContent(),
          baseSha: state.baseSha,
          savedAt: Date.now(),
        }),
      300,
    );
    return () => clearTimeout(id);
  }, [content, state.unsaved, state.baseSha, note.path, controller, pendingDraft]);

  // Gravar ao sair da aba/página; avisar se houver algo não confirmado.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') controller.saveNow();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.getState().unsaved) {
        controller.saveNow();
        event.preventDefault();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        controller.saveNow();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKey);
      controller.saveNow(); // navegação interna: grava o que estiver pendente
    };
  }, [controller]);

  const deferred = useDeferredValue(content);
  const parsed = useMemo(() => parseNote(note.path, deferred), [note.path, deferred]);
  const resolver = useMemo(
    () =>
      new LinkResolver(
        [...tree.notes, ...tree.attachments],
        new Map([[note.path, parsed.aliases]]),
      ),
    [tree.notes, tree.attachments, note.path, parsed.aliases],
  );

  const changeMode = (next: ViewMode) => {
    setMode(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // preferência apenas visual
    }
  };

  async function reloadRemote(confirmFirst: boolean) {
    if (
      confirmFirst &&
      !window.confirm('Descartar suas alterações locais e carregar a versão atual do vault?')
    )
      return;
    setBusy(true);
    try {
      const remote = await readNote(note.path);
      replaceEditor(remote.content);
      controller.reset(remote.content, remote.sha);
      removeDraft(note.path);
      if (confirmFirst) setNotice({ text: 'Versão do vault carregada.' });
    } catch (error) {
      setNotice({
        text:
          error instanceof ApiError
            ? error.message
            : 'Sem conexão: não foi possível ler a versão remota.',
      });
    }
    setBusy(false);
  }

  async function saveCopy() {
    setBusy(true);
    try {
      const copy = await createConflictCopy({
        sourcePath: note.path,
        content: controller.getContent(),
      });
      setNotice({
        text: `Sua versão foi salva como nova nota: ${copy.path}`,
        href: noteHref(copy.path),
      });
      router.refresh();
      await reloadRemote(false);
    } catch (error) {
      setNotice({
        text: error instanceof ApiError ? error.message : 'Sem conexão: a cópia não foi criada.',
      });
    }
    setBusy(false);
  }

  async function overwrite() {
    const history = storeKind === 'github' ? ' A versão atual continuará no histórico do Git.' : '';
    if (!window.confirm(`Substituir a versão do vault pela sua?${history}`)) return;
    setBusy(true);
    try {
      const remote = await readNote(note.path);
      const mine = controller.getContent();
      const outcome = await saveNote({ path: note.path, content: mine, expectedSha: remote.sha });
      if (outcome.kind === 'saved') {
        controller.reset(mine, outcome.sha);
        removeDraft(note.path);
        setNotice({ text: 'Sua versão foi gravada no vault.' });
      } else {
        setNotice({ text: `Não foi possível sobrescrever: ${outcome.message}` });
      }
    } catch {
      setNotice({ text: 'Sem conexão: nada foi alterado.' });
    }
    setBusy(false);
  }

  const createFromLink = useCallback((title: string) => openNewNote({ title }), [openNewNote]);

  async function moveToTrash() {
    if (controller.getState().unsaved) {
      setNotice({ text: 'Salve as alterações (Ctrl+S) antes de mover a nota para a lixeira.' });
      return;
    }
    if (!window.confirm('Mover esta nota para a lixeira? Você pode restaurá-la depois.')) return;
    setBusy(true);
    try {
      await trashNote({ path: note.path, expectedSha: controller.getState().baseSha });
      removeDraft(note.path);
      router.push('/trash');
      router.refresh();
    } catch (error) {
      setNotice({
        text: error instanceof ApiError ? error.message : 'Sem conexão: a nota não foi movida.',
      });
      setBusy(false);
    }
  }

  function startRename() {
    if (controller.getState().unsaved) {
      setNotice({ text: 'Salve as alterações (Ctrl+S) antes de renomear ou mover a nota.' });
      return;
    }
    setRenameOpen(true);
  }

  function onRenamed(outcome: RenameOutcome) {
    removeDraft(note.path);
    notePathChanged(note.path, outcome.path);
    const count = outcome.updatedNotes.length;
    notify(
      count
        ? `Nota renomeada para ${outcome.path}; links atualizados em ${count} nota${count > 1 ? 's' : ''}.`
        : `Nota renomeada para ${outcome.path}.`,
    );
    setRenameOpen(false);
    router.replace(noteHref(outcome.path));
    router.refresh();
  }

  async function restoreToVersion(commit: CommitDto) {
    if (controller.getState().unsaved) {
      setNotice({ text: 'Salve as alterações (Ctrl+S) antes de restaurar uma versão.' });
      return;
    }
    if (
      !window.confirm(
        'Restaurar esta versão? Ela vira a versão atual; nada do histórico é apagado.',
      )
    )
      return;
    setBusy(true);
    try {
      const restored = await restoreVersion({
        path: note.path,
        commitSha: commit.sha,
        expectedSha: controller.getState().baseSha,
      });
      replaceEditor(restored.content);
      controller.reset(restored.content, restored.sha);
      removeDraft(note.path);
      setNotice({ text: 'Versão restaurada como versão atual.' });
    } catch (error) {
      setNotice({
        text: error instanceof ApiError ? error.message : 'Sem conexão: nada foi alterado.',
      });
    }
    setBusy(false);
  }

  function restoreDraft(draft: Draft) {
    replaceEditor(draft.content);
    // Versão esperada = a que o rascunho conhecia; se o remoto mudou, a gravação vira conflito.
    controller.reset(note.content, draft.baseSha, draft.content);
    setPendingDraft(null);
  }

  const showEditor = mode !== 'preview';
  const showPreview = mode !== 'edit';

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold" title={parsed.title}>
            {parsed.title}
          </h1>
          <p className="text-muted-foreground truncate text-xs" title={note.path}>
            {note.path}
          </p>
        </div>
        <SaveStatus state={state} onRetry={() => controller.saveNow()} />
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-pressed={favorite}
            aria-label={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            title={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            onClick={() => toggleFavorite(note.path)}
          >
            <StarIcon className={favorite ? 'text-warning fill-current' : undefined} />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Renomear ou mover"
            title="Renomear ou mover"
            disabled={busy}
            onClick={startRename}
          >
            <FolderInputIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Mover para a lixeira"
            title="Mover para a lixeira"
            disabled={busy}
            onClick={moveToTrash}
          >
            <Trash2Icon />
          </Button>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Modo de exibição">
          {(
            [
              ['edit', PencilIcon, 'Editar'],
              ['split', Columns2Icon, 'Editar e visualizar'],
              ['preview', EyeIcon, 'Visualizar'],
            ] as const
          ).map(([value, Icon, label]) => (
            <Button
              key={value}
              size="icon-sm"
              variant={mode === value ? 'outline' : 'ghost'}
              aria-pressed={mode === value}
              aria-label={label}
              title={label}
              onClick={() => changeMode(value)}
            >
              <Icon />
            </Button>
          ))}
          <Button
            size="icon-sm"
            variant={detailsOpen ? 'outline' : 'ghost'}
            aria-expanded={detailsOpen}
            aria-controls="note-details"
            aria-label="Detalhes da nota"
            title="Detalhes da nota"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <PanelRightIcon />
          </Button>
        </div>
      </header>

      {state.status === 'conflict' ? (
        <div
          role="alert"
          className="bg-warning-surface flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm"
        >
          <p className="min-w-0 flex-1">
            <strong>Esta nota mudou em outro lugar</strong> (Obsidian, outra aba ou dispositivo)
            depois que você a abriu. Nada foi sobrescrito; seu texto continua aqui.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={saveCopy} disabled={busy}>
              Salvar minha versão como cópia
            </Button>
            <Button size="sm" variant="outline" onClick={() => reloadRemote(true)} disabled={busy}>
              Carregar versão do vault
            </Button>
            <Button size="sm" variant="outline" onClick={overwrite} disabled={busy}>
              Sobrescrever com a minha
            </Button>
          </div>
        </div>
      ) : null}

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-destructive border-b px-4 py-2 text-sm">
          {state.message} Seu texto está guardado neste navegador.
        </p>
      ) : null}

      {pendingDraft ? (
        <div
          role="alert"
          className="bg-warning-surface flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm"
        >
          <p className="min-w-0 flex-1">
            Há alterações desta nota que não chegaram ao vault (rascunho de{' '}
            {new Date(pendingDraft.savedAt).toLocaleString('pt-BR')}). O editor fica bloqueado até
            você decidir.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => restoreDraft(pendingDraft)}>
              Restaurar rascunho
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (!window.confirm('Descartar o rascunho não sincronizado?')) return;
                removeDraft(note.path);
                setPendingDraft(null);
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="bg-accent text-accent-foreground flex items-center gap-2 border-b px-4 py-2 text-sm"
        >
          <span className="flex-1">
            {notice.text}{' '}
            {notice.href ? (
              <Link href={notice.href} className="underline underline-offset-2">
                Abrir
              </Link>
            ) : null}
          </span>
          <button type="button" className="text-xs underline" onClick={() => setNotice(null)}>
            Fechar
          </button>
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {showEditor ? (
          <section
            aria-label="Editor"
            className={cn(
              'min-h-0 min-w-0 overflow-hidden',
              showPreview ? 'hidden flex-1 border-r lg:block' : 'flex-1',
            )}
          >
            <div className="mx-auto h-full max-w-3xl">
              <MarkdownEditor
                initialValue={note.content}
                readOnly={pendingDraft !== null}
                onReady={session.attachView}
                onChange={onEditorChange}
                suggest={session.suggest}
              />
            </div>
          </section>
        ) : null}
        {showPreview ? (
          <section aria-label="Visualização" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl">
              <MarkdownPreview
                content={deferred}
                path={note.path}
                resolver={resolver}
                onCreateNote={createFromLink}
              />
            </div>
          </section>
        ) : null}
        {detailsOpen ? (
          <aside
            id="note-details"
            aria-label="Detalhes da nota"
            className="bg-sidebar w-72 shrink-0 overflow-y-auto border-l max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-20"
          >
            <NoteDetails
              note={parsed}
              resolver={resolver}
              onCreateNote={createFromLink}
              backlinks={<NoteBacklinks path={note.path} />}
              history={<NoteHistory path={note.path} onRestore={restoreToVersion} />}
            />
          </aside>
        ) : null}
      </div>
      {renameOpen ? (
        <RenameDialog
          open
          onOpenChange={setRenameOpen}
          path={note.path}
          expectedSha={state.baseSha}
          onRenamed={onRenamed}
        />
      ) : null}
    </div>
  );
}
