import { describe, expect, it } from 'vitest';
import { suggestNotes } from './suggest';

const paths = [
  '04-Concepts/Posicionamento.md',
  '03-Permanent-Notes/Posicionamento é escolha.md',
  '03-Permanent-Notes/Vendas consultivas.md',
  '05-Projects/Cliente A/Plano.md',
  '05-Projects/Cliente B/Plano.md',
  '02-Sources/Books/Ação e reação.md',
];

describe('suggestNotes', () => {
  it('prioriza prefixo do nome e ignora acentos e maiúsculas', () => {
    expect(suggestNotes('posic', paths).map((s) => s.label)).toEqual([
      'Posicionamento',
      'Posicionamento é escolha',
    ]);
    expect(suggestNotes('acao', paths).map((s) => s.label)).toEqual(['Ação e reação']);
    expect(suggestNotes('REAÇÃO', paths).map((s) => s.label)).toEqual(['Ação e reação']);
  });

  it('acha por início de palavra, trecho e pasta', () => {
    expect(suggestNotes('consult', paths)[0]?.label).toBe('Vendas consultivas');
    expect(suggestNotes('cliente b', paths).map((s) => s.path)).toEqual([
      '05-Projects/Cliente B/Plano.md',
    ]);
  });

  it('nomes repetidos inserem o caminho para evitar link ambíguo', () => {
    const planos = suggestNotes('plano', paths);
    expect(planos.map((s) => s.insert)).toEqual([
      '05-Projects/Cliente A/Plano',
      '05-Projects/Cliente B/Plano',
    ]);
    expect(suggestNotes('vendas', paths)[0]?.insert).toBe('Vendas consultivas');
  });

  it('respeita o limite e lista tudo com consulta vazia', () => {
    expect(suggestNotes('', paths, 3)).toHaveLength(3);
    expect(suggestNotes('zzz', paths)).toEqual([]);
  });
});
