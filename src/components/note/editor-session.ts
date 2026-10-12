import type { EditorView } from '@codemirror/view';
import { saveNote, type NoteDto } from '@/lib/client/api';
import { loadDraft, removeDraft } from '@/lib/editor/drafts';
import { SaveController } from '@/lib/editor/save-controller';
import { isoDateInTimeZone } from '@/lib/notes/dates';
import { applyChange, scalarFieldChange } from '@/lib/notes/frontmatter';

/**
 * Liga o `SaveController` ao CodeMirror sem passar refs do React para dentro de callbacks.
 * Criado uma vez por nota aberta.
 */
export function createEditorSession(note: NoteDto, timeZone: string) {
  let view: EditorView | null = null;

  const controller = new SaveController({
    path: note.path,
    initialContent: note.content,
    initialSha: note.sha,
    save: async (request) => {
      const outcome = await saveNote(request);
      // O rascunho só sai do navegador quando ESTE conteúdo foi confirmado pelo servidor.
      if (outcome.kind === 'saved' && loadDraft(request.path)?.content === request.content)
        removeDraft(request.path);
      return outcome;
    },
    beforeSave: (text) => {
      // `updated` é ajustado no editor, à vista do usuário — o servidor nunca altera o conteúdo.
      const change = scalarFieldChange(text, 'updated', isoDateInTimeZone(new Date(), timeZone));
      if (!change) return text;
      if (view && view.state.doc.toString() === text) {
        view.dispatch({ changes: change });
        return view.state.doc.toString();
      }
      return applyChange(text, change);
    },
  });

  return {
    controller,
    attachView(next: EditorView) {
      view = next;
    },
    /** Substitui o texto inteiro do editor (recarregar versão remota, restaurar rascunho). */
    replace(text: string) {
      if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
  };
}
