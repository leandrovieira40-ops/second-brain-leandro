import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { bodyStart, hiddenFrontmatter, programmatic } from './editor-extensions';

const NOTE = '---\nid: 01ABC\ntitle: Paixão\n---\nNada de grandioso.\n';
const BODY = NOTE.indexOf('Nada');

const stateOf = (doc: string, cursor = 0) =>
  EditorState.create({ doc, selection: { anchor: cursor }, extensions: hiddenFrontmatter });

describe('bodyStart', () => {
  it('aponta para depois do --- de fechamento', () => {
    expect(bodyStart(NOTE)).toBe(BODY);
    expect(bodyStart('---\r\na: 1\r\n---\r\ntexto')).toBe('---\r\na: 1\r\n---\r\n'.length);
  });

  it('é 0 sem frontmatter ou quando o arquivo termina no ---', () => {
    expect(bodyStart('Só texto\n')).toBe(0);
    expect(bodyStart('---\na: 1\n---')).toBe(0);
  });
});

describe('frontmatter escondido no editor', () => {
  it('o cursor vai para o começo do corpo', () => {
    const state = stateOf(NOTE).update({ selection: { anchor: 0 } }).state;
    expect(state.selection.main.head).toBe(BODY);
  });

  it('digitação do usuário não altera o frontmatter', () => {
    let state = stateOf(NOTE, BODY);
    state = state.update({ changes: { from: 4, to: 13, insert: '' } }).state;
    expect(state.doc.toString()).toBe(NOTE);
    // Apagar com Backspace no começo do corpo não junta o texto ao "---".
    state = state.update({ changes: { from: BODY - 1, to: BODY } }).state;
    expect(state.doc.toString()).toBe(NOTE);
    // Selecionar tudo e apagar preserva o frontmatter.
    state = state.update({
      changes: { from: 0, to: state.doc.length },
      selection: EditorSelection.cursor(0),
    }).state;
    expect(state.doc.toString()).toBe(NOTE.slice(0, BODY));
  });

  it('escrever no corpo funciona normalmente', () => {
    const state = stateOf(NOTE, BODY).update({ changes: { from: BODY, insert: 'Oi. ' } }).state;
    expect(state.doc.toString()).toBe(`${NOTE.slice(0, BODY)}Oi. Nada de grandioso.\n`);
  });

  it('a aplicação pode atualizar o frontmatter (campo updated, recarregar)', () => {
    const state = stateOf(NOTE, BODY).update({
      changes: { from: 4, to: 13, insert: 'id: 02XYZ' },
      annotations: programmatic.of(true),
    }).state;
    expect(state.doc.toString()).toContain('id: 02XYZ');
  });

  it('sem frontmatter, nada é bloqueado', () => {
    const state = stateOf('Texto\n').update({ changes: { from: 0, to: 5, insert: 'Outro' } }).state;
    expect(state.doc.toString()).toBe('Outro\n');
  });
});
