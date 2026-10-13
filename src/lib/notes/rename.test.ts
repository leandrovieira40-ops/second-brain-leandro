import { describe, expect, it } from 'vitest';
import { titleToFileName } from './filename';
import {
  affectedSources,
  followsFileName,
  renameContext,
  rewriteLinksForRename,
  shortestLinkTarget,
} from './rename';
import { LinkResolver } from './resolve';

const paths = [
  '20-Areas/Marketing/Posicionamento.md',
  '30-Resources/Conceitos/Funil.md',
  '30-Resources/Conceitos/Persona.md',
  '10-Projects/Lançamento/Persona.md',
  '10-Projects/Lançamento/Plano.md',
  '90-Attachments/diagrama.png',
];

const ctx = (oldPath: string, newPath: string, aliases = new Map<string, string[]>()) =>
  renameContext({ oldPath, newPath, paths, aliases });

describe('rewriteLinksForRename', () => {
  it('troca só o destino, preservando seção, apelido, embed e o restante do texto', () => {
    const context = ctx(
      '20-Areas/Marketing/Posicionamento.md',
      '20-Areas/Marketing/Proposta de valor.md',
    );
    const content = [
      '---',
      'title: Plano',
      'related: "[[Posicionamento]]"',
      '---',
      'Ver [[Posicionamento]], [[Posicionamento#Público|o público]] e ![[Posicionamento#^bloco]].',
      'Em tabela: | [[Posicionamento\\|apelido]] |',
      '`[[Posicionamento]]` em código fica igual.',
      '%% [[Posicionamento]] em comentário também %%',
      '',
    ].join('\n');
    const result = rewriteLinksForRename(
      content,
      '10-Projects/Lançamento/Plano.md',
      '10-Projects/Lançamento/Plano.md',
      context,
    );
    expect(result.changed).toBe(4);
    expect(result.content).toBe(
      [
        '---',
        'title: Plano',
        'related: "[[Posicionamento]]"',
        '---',
        'Ver [[Proposta de valor]], [[Proposta de valor#Público|o público]] e ![[Proposta de valor#^bloco]].',
        'Em tabela: | [[Proposta de valor\\|apelido]] |',
        '`[[Posicionamento]]` em código fica igual.',
        '%% [[Posicionamento]] em comentário também %%',
        '',
      ].join('\n'),
    );
  });

  it('mantém o estilo do link: com pasta e com extensão continuam assim', () => {
    const context = ctx(
      '30-Resources/Conceitos/Funil.md',
      '30-Resources/Modelos/Funil de vendas.md',
    );
    const content =
      'A [[Conceitos/Funil]] B [[30-Resources/Conceitos/Funil.md|funil]] C [[funil]]\n';
    const result = rewriteLinksForRename(content, '00-Inbox/X.md', '00-Inbox/X.md', context);
    expect(result.content).toBe(
      'A [[Modelos/Funil de vendas]] B [[Modelos/Funil de vendas.md|funil]] C [[Funil de vendas]]\n',
    );
  });

  it('não mexe em links que continuam resolvendo para a nota movida (mesmo nome, outra pasta)', () => {
    const context = ctx('30-Resources/Conceitos/Funil.md', '20-Areas/Marketing/Funil.md');
    const content = 'Ver [[Funil]].\n';
    expect(rewriteLinksForRename(content, '00-Inbox/X.md', '00-Inbox/X.md', context)).toEqual({
      content,
      changed: 0,
    });
  });

  it('usa a pasta quando só o nome ficaria ambíguo depois da renomeação', () => {
    const context = ctx('30-Resources/Conceitos/Funil.md', '30-Resources/Conceitos/Persona 2.md');
    // "Persona" já existe em duas pastas; renomear para um nome único não precisa de pasta.
    expect(
      rewriteLinksForRename('[[Funil]]', '00-Inbox/X.md', '00-Inbox/X.md', context).content,
    ).toBe('[[Persona 2]]');
    const clash = ctx('20-Areas/Marketing/Posicionamento.md', '20-Areas/Marketing/Plano.md');
    expect(
      rewriteLinksForRename('[[Posicionamento]]', '00-Inbox/X.md', '00-Inbox/X.md', clash).content,
    ).toBe('[[Marketing/Plano]]');
  });

  it('protege links de outras notas que passariam a resolver para o nome novo', () => {
    // De 00-Inbox, [[Funil]] aponta para Conceitos/Funil. Se outra nota for renomeada para
    // 00-Inbox/Funil.md, a regra "mesma pasta vence" desviaria o link — então ele ganha a pasta.
    const context = ctx('20-Areas/Marketing/Posicionamento.md', '00-Inbox/Funil.md');
    const source = '00-Inbox/X.md';
    expect(rewriteLinksForRename('Ver [[Funil]].', source, source, context).content).toBe(
      'Ver [[Conceitos/Funil]].',
    );
    expect(affectedSources([{ sourcePath: source, targetRaw: 'Funil' }], context)).toEqual([
      source,
    ]);
  });

  it('reescreve links da própria nota movida que mudariam de destino', () => {
    // [[Persona]] dentro de Lançamento aponta para a Persona de Lançamento; ao mover a nota para
    // Conceitos, o mesmo texto passaria a apontar para a Persona de Conceitos.
    const context = ctx('10-Projects/Lançamento/Plano.md', '30-Resources/Conceitos/Plano.md');
    const result = rewriteLinksForRename(
      'Ver [[Persona]] e [[Plano#Metas]] e [[#Topo]].',
      '10-Projects/Lançamento/Plano.md',
      '30-Resources/Conceitos/Plano.md',
      context,
    );
    expect(result.content).toBe('Ver [[Lançamento/Persona]] e [[Plano#Metas]] e [[#Topo]].');
  });

  it('não toca links quebrados nem links por apelido que continuam válidos', () => {
    const aliases = new Map([['20-Areas/Marketing/Posicionamento.md', ['Positioning']]]);
    const context = ctx(
      '20-Areas/Marketing/Posicionamento.md',
      '20-Areas/Marketing/Marca.md',
      aliases,
    );
    const content = '[[Positioning]] [[Nota que não existe]]';
    expect(rewriteLinksForRename(content, '00-Inbox/X.md', '00-Inbox/X.md', context).changed).toBe(
      0,
    );
  });

  it('funciona com anexos e com finais de linha CRLF', () => {
    const context = ctx('20-Areas/Marketing/Posicionamento.md', '20-Areas/Marketing/Marca.md');
    const content = '---\r\ntitle: X\r\n---\r\n![[diagrama.png]]\r\n[[Posicionamento]]\r\n';
    expect(rewriteLinksForRename(content, '00-Inbox/X.md', '00-Inbox/X.md', context).content).toBe(
      '---\r\ntitle: X\r\n---\r\n![[diagrama.png]]\r\n[[Marca]]\r\n',
    );
  });
});

describe('affectedSources', () => {
  it('lista só as notas cujos links mudariam de destino', () => {
    const context = ctx('30-Resources/Conceitos/Funil.md', '30-Resources/Conceitos/Jornada.md');
    const links = [
      { sourcePath: '10-Projects/Lançamento/Plano.md', targetRaw: 'Funil' },
      { sourcePath: '10-Projects/Lançamento/Plano.md', targetRaw: 'Persona' },
      { sourcePath: '20-Areas/Marketing/Posicionamento.md', targetRaw: 'Persona' },
      { sourcePath: '30-Resources/Conceitos/Funil.md', targetRaw: 'Funil' },
      { sourcePath: '00-Inbox/A.md', targetRaw: 'Inexistente' },
    ];
    expect(affectedSources(links, context)).toEqual(['10-Projects/Lançamento/Plano.md']);
  });
});

describe('shortestLinkTarget', () => {
  it('cai no caminho completo quando nenhum sufixo é inequívoco', () => {
    const resolver = new LinkResolver(['a/x/N.md', 'b/x/N.md']);
    expect(
      shortestLinkTarget('a/x/N.md', 'c/Y.md', resolver, {
        withExtension: false,
        withFolder: false,
      }),
    ).toBe('a/x/N');
  });
});

describe('followsFileName', () => {
  it('reconhece títulos que geraram o nome do arquivo', () => {
    expect(followsFileName('Ideia: foco', 'P/Ideia - foco.md', titleToFileName)).toBe(true);
    expect(followsFileName('Outro título', 'P/Ideia - foco.md', titleToFileName)).toBe(false);
    expect(followsFileName(42, 'P/42.md', titleToFileName)).toBe(false);
  });
});
