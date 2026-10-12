'use client';

import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';

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
}

/** Editor do texto exato do arquivo (frontmatter incluído) — nada é reformatado (ADR-0003). */
export default function MarkdownEditor({
  initialValue,
  readOnly,
  onChange,
  onReady,
}: MarkdownEditorProps) {
  // Ctrl/Cmd+S não é tratado aqui: sobe até o atalho global da área da nota.
  const extensions = useMemo(
    () => [
      // Frontmatter YAML reconhecido como tal (sem isso, `chave: valor` + `---` vira cabeçalho Markdown).
      yamlFrontmatter({ content: markdown({ base: markdownLanguage, codeLanguages: languages }) }),
      EditorView.lineWrapping,
      syntaxHighlighting(highlight),
      EditorView.contentAttributes.of({
        'aria-label': 'Editor da nota (Markdown)',
        spellcheck: 'true',
        lang: 'pt-BR',
      }),
    ],
    [],
  );

  return (
    <CodeMirror
      value={initialValue}
      height="100%"
      className="h-full"
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
      onCreateEditor={onReady}
    />
  );
}
