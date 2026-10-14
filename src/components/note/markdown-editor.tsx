'use client';

import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';
import type { NoteSuggestion } from '@/lib/notes/suggest';
import { bodyStart, hiddenFrontmatter, livePreview } from './editor-extensions';

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.5em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.3em', fontWeight: '700' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: '600' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '600' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--primary)' },
  { tag: t.quote, color: 'var(--muted-foreground)', fontStyle: 'italic' },
  { tag: [t.monospace], fontFamily: 'var(--font-mono)', fontSize: '0.9em' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--muted-foreground)' },
  { tag: [t.keyword, t.atom, t.bool], color: 'var(--accent-foreground)' },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: 'var(--muted-foreground)' },
  { tag: [t.string], color: 'var(--success)' },
  { tag: [t.comment], color: 'var(--muted-foreground)' },
]);

export interface MarkdownEditorProps {
  initialValue: string;
  readOnly?: boolean;
  /** Deve ser estável (useCallback): o editor é reconfigurado quando muda. */
  onChange: (value: string) => void;
  onReady: (view: EditorView) => void;
  /** Sugestões para `[[` (deve ser estável). */
  suggest: (query: string) => NoteSuggestion[];
}

/** Fonte de autocompletar: ativa ao digitar `[[`, insere `Nome]]` (sem duplicar `]]`). */
function wikilinkCompletions(suggest: (query: string) => NoteSuggestion[]) {
  return (context: CompletionContext) => {
    const match = context.matchBefore(/\[\[[^[\]|#\n]*$/);
    if (!match) return null;
    const query = match.text.slice(2);
    const after = context.state.sliceDoc(context.pos, context.pos + 2);
    return {
      from: match.from + 2,
      filter: false,
      options: suggest(query).map((item) => ({
        label: item.label,
        detail: item.folder,
        apply: after === ']]' ? item.insert : `${item.insert}]]`,
        type: 'text',
      })),
    };
  };
}

/**
 * Editor do texto exato do arquivo — nada é reformatado (ADR-0003). O frontmatter continua no
 * texto, mas fica escondido (as propriedades aparecem no painel de detalhes).
 */
export default function MarkdownEditor({
  initialValue,
  readOnly,
  onChange,
  onReady,
  suggest,
}: MarkdownEditorProps) {
  // Ctrl/Cmd+S não é tratado aqui: sobe até o atalho global da área da nota.
  const extensions = useMemo(
    () => [
      // Frontmatter YAML reconhecido como tal (sem isso, `chave: valor` + `---` vira cabeçalho Markdown).
      yamlFrontmatter({ content: markdown({ base: markdownLanguage, codeLanguages: languages }) }),
      EditorView.lineWrapping,
      syntaxHighlighting(highlight),
      hiddenFrontmatter,
      livePreview,
      autocompletion({ override: [wikilinkCompletions(suggest)], activateOnTyping: true }),
      EditorView.contentAttributes.of({
        'aria-label': 'Texto da nota',
        spellcheck: 'true',
        lang: 'pt-BR',
      }),
    ],
    [suggest],
  );

  return (
    <CodeMirror
      value={initialValue}
      className="note-editor"
      theme="none"
      readOnly={readOnly}
      extensions={extensions}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
      }}
      onChange={onChange}
      onCreateEditor={(view) => {
        // Começa com o cursor no corpo, depois do frontmatter escondido.
        const start = bodyStart(view.state.doc.toString());
        if (start > 0) view.dispatch({ selection: { anchor: start } });
        onReady(view);
      }}
    />
  );
}
