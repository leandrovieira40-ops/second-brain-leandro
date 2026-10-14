import { syntaxTree } from '@codemirror/language';
import {
  Annotation,
  EditorSelection,
  EditorState,
  RangeSetBuilder,
  StateField,
  type Range,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { findFrontmatter } from '@/lib/notes/frontmatter';

/**
 * Alteração feita pela própria aplicação (campo `updated`, recarregar/restaurar o texto inteiro):
 * pode mexer no frontmatter escondido.
 */
export const programmatic = Annotation.define<boolean>();

/**
 * Onde começa o corpo, logo após a linha `---` de fechamento do frontmatter; 0 se não houver
 * frontmatter (ou se o arquivo termina no `---`, sem quebra de linha: aí ele fica visível).
 */
export function bodyStart(doc: string): number {
  const end = findFrontmatter(doc)?.bodyStart ?? 0;
  return end > 0 && doc[end - 1] === '\n' ? end : 0;
}

class PlaceholderWidget extends WidgetType {
  override eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-body-placeholder';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = 'Comece a escrever aqui… (salva sozinho)';
    return span;
  }
  override ignoreEvent() {
    return true;
  }
}

function frontmatterDecorations(state: EditorState): DecorationSet {
  const doc = state.doc.toString();
  const end = bodyStart(doc);
  const builder = new RangeSetBuilder<Decoration>();
  if (end > 0) {
    // Esconde as linhas do frontmatter (o texto continua no arquivo, intacto).
    builder.add(0, end - 1, Decoration.replace({ block: true }));
  }
  if (doc.slice(end).trim() === '') {
    builder.add(end, end, Decoration.widget({ widget: new PlaceholderWidget(), side: 1 }));
  }
  return builder.finish();
}

/**
 * Frontmatter (id, type, created…) fica fora da vista do editor, como no Notion: as propriedades
 * aparecem no painel de detalhes. O usuário não consegue apagá-lo por acidente.
 */
export const hiddenFrontmatter: Extension = [
  StateField.define<DecorationSet>({
    create: frontmatterDecorations,
    update: (value, tr) => (tr.docChanged ? frontmatterDecorations(tr.state) : value),
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field)),
    ],
  }),
  // Digitação do usuário não altera o frontmatter (só alterações marcadas como `programmatic`).
  EditorState.changeFilter.of((tr) => {
    if (tr.annotation(programmatic)) return true;
    const end = bodyStart(tr.startState.doc.toString());
    return end > 0 ? [0, end] : true;
  }),
  // O cursor nunca fica antes do frontmatter.
  EditorState.transactionFilter.of((tr) => {
    if (!tr.selection || tr.annotation(programmatic)) return tr;
    const end = bodyStart(tr.newDoc.toString());
    if (end === 0) return tr;
    const ranges = tr.selection.ranges;
    if (ranges.every((range) => range.from >= end)) return tr;
    return [
      tr,
      {
        selection: EditorSelection.create(
          ranges.map((range) =>
            EditorSelection.range(Math.max(range.anchor, end), Math.max(range.head, end)),
          ),
          tr.selection.mainIndex,
        ),
        sequential: true,
      },
    ];
  }),
];

/** Marcas de formatação do Markdown que somem fora da linha em edição (`#`, `**`, `~~`, `` ` ``). */
const HIDDEN_MARKS = new Set(['HeaderMark', 'EmphasisMark', 'StrikethroughMark', 'CodeMark']);

const WIKILINK = /!?\[\[[^[\]\n]+\]\]/g;

function livePreviewDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  // Linhas em edição mostram o Markdown como está (só enquanto o editor tem o foco).
  const activeLines = new Set<number>();
  if (view.hasFocus) {
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number;
      const last = state.doc.lineAt(range.to).number;
      for (let line = first; line <= last; line++) activeLines.add(line);
    }
  }
  const active = (pos: number) => activeLines.has(state.doc.lineAt(pos).number);
  const hide = Decoration.replace({});
  const link = Decoration.mark({ class: 'cm-wikilink' });
  const decorations: Range<Decoration>[] = [];
  const code: { from: number; to: number }[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode') {
          code.push({ from: node.from, to: node.to });
          if (node.name !== 'InlineCode') return false;
        }
        if (!HIDDEN_MARKS.has(node.name) || active(node.from)) return;
        let end = node.to;
        // "# Título": some o "#" e o espaço depois dele.
        if (node.name === 'HeaderMark' && state.doc.sliceString(end, end + 1) === ' ') end++;
        if (end > node.from) decorations.push(hide.range(node.from, end));
      },
    });
    // [[Links]]: o nome aparece como link; os colchetes só na linha em edição.
    const text = state.doc.sliceString(from, to);
    for (const match of text.matchAll(WIKILINK)) {
      const start = from + match.index;
      const stop = start + match[0].length;
      if (code.some((range) => start < range.to && stop > range.from)) continue;
      const open = match[0].startsWith('!') ? 3 : 2;
      decorations.push(link.range(start + open, stop - 2));
      if (active(start)) continue;
      decorations.push(hide.range(start, start + open), hide.range(stop - 2, stop));
    }
  }
  return Decoration.set(dedupe(decorations), true);
}

/** Substituições não podem se sobrepor (ex.: marca de ênfase dentro de um [[link]]). */
function dedupe(decorations: Range<Decoration>[]): Range<Decoration>[] {
  const sorted = [...decorations].sort((a, b) => a.from - b.from || a.to - b.to);
  const result: Range<Decoration>[] = [];
  let replacedUntil = -1;
  for (const item of sorted) {
    const isReplace = item.from < item.to && item.value.spec.class === undefined;
    if (isReplace) {
      if (item.from < replacedUntil) continue;
      replacedUntil = item.to;
    }
    result.push(item);
  }
  return result;
}

/**
 * Visualização ao vivo (como no Notion/Obsidian): títulos e negrito aparecem formatados e os
 * símbolos do Markdown só aparecem na linha em que o cursor está. O texto salvo não muda.
 */
export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = livePreviewDecorations(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.focusChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = livePreviewDecorations(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
