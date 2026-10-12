import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect, type Database } from '@/lib/db/connect';
import { NoteIndex } from '@/lib/index/indexer';
import {
  backlinksTo,
  brokenLinks,
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  listTags,
  orphanNotes,
  referencingNotes,
  searchNotes,
} from '@/lib/index/queries';
import { gitBlobShaOfText } from '@/lib/vault/blob';
import { NotesService, type WrittenChange } from '@/lib/services/notes';
import { MemoryVaultStore } from '@/lib/vault/memory-store';

/**
 * Integração com PostgreSQL REAL (sem mocks). Roda quando TEST_DATABASE_URL está definida
 * (CI: serviço postgres; local: qualquer banco descartável). O banco é limpo a cada teste.
 */
const url = process.env.TEST_DATABASE_URL;

const VAULT = {
  '04-Concepts/Posicionamento.md':
    '---\ntitle: Posicionamento\ntype: concept\ntags: [marketing, estratégia]\naliases: [Positioning]\n---\nO lugar que uma oferta ocupa na mente do cliente.\n',
  '03-Permanent-Notes/Posicionar é escolher.md':
    '---\ntype: permanent\ntags: [estratégia]\n---\nPosicionar é decidir o que não ser. Ver [[Positioning]] e [[Conceito futuro]].\n',
  '02-Sources/Books/Ação e reação.md':
    '---\ntype: book\n---\nLivro sobre ações, reações e consequências na estratégia de vendas.\n![[diagrama.png]]\n',
  'Attachments/diagrama.png': 'png',
  '.trash/Antiga.md': 'apagada [[Posicionamento]]',
  '00-Inbox/Solta.md': 'sem links',
};

describe.skipIf(!url)('índice derivado (PostgreSQL real)', () => {
  let db: Database;
  let pool: { end(): Promise<void> };

  beforeAll(async () => {
    ({ db, pool } = connect(url!));
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
  });
  afterAll(async () => pool.end());
  beforeEach(async () => {
    await db.execute(sql`truncate notes, links, attachments, sync_state restart identity cascade`);
  });

  async function indexed(files: Record<string, string> = VAULT) {
    const store = new MemoryVaultStore(files);
    const index = new NoteIndex(db, store);
    const result = await index.sync();
    return { store, index, result };
  }

  it('indexa notas visíveis, ignora lixeira e resolve links (inclusive por alias e embed)', async () => {
    const { result } = await indexed();
    expect(result).toEqual({ added: 4, updated: 0, removed: 0, total: 4 });
    expect(await backlinksTo(db, '04-Concepts/Posicionamento.md')).toEqual([
      {
        sourcePath: '03-Permanent-Notes/Posicionar é escolher.md',
        sourceTitle: 'Posicionar é escolher',
        line: 1,
        context: 'Posicionar é decidir o que não ser. Ver [[Positioning]] e [[Conceito futuro]].',
      },
    ]);
    expect(await brokenLinks(db)).toEqual([
      {
        sourcePath: '03-Permanent-Notes/Posicionar é escolher.md',
        targetRaw: 'Conceito futuro',
        line: 1,
      },
    ]);
    expect(await orphanNotes(db)).toEqual(['00-Inbox/Solta.md']);
    expect(await listTags(db)).toEqual([
      { tag: 'estratégia', count: 2 },
      { tag: 'marketing', count: 1 },
    ]);
  });

  it('busca sem acentos, por prefixo, com tolerância a erro de digitação e trechos destacados', async () => {
    await indexed();
    const titles = async (q: string) => (await searchNotes(db, { q })).map((hit) => hit.title);
    expect(await titles('acao')).toContain('Ação e reação');
    expect(await titles('reaç')).toContain('Ação e reação');
    expect((await titles('posic'))[0]).toBe('Posicionamento');
    // Alias da nota vem primeiro; a outra nota também cita "Positioning" no corpo.
    expect((await titles('positioning'))[0]).toBe('Posicionamento');
    expect(await titles('posicionamneto')).toContain('Posicionamento');
    const [hit] = await searchNotes(db, { q: 'consequências' });
    expect(hit?.snippet).toContain(`${HIGHLIGHT_START}consequências${HIGHLIGHT_END}`);
  });

  it('filtros: #tag na consulta, tipo e pasta', async () => {
    await indexed();
    const paths = async (filters: Parameters<typeof searchNotes>[1]) =>
      (await searchNotes(db, filters)).map((hit) => hit.path).sort();
    expect(await paths({ q: '#estratégia' })).toEqual([
      '03-Permanent-Notes/Posicionar é escolher.md',
      '04-Concepts/Posicionamento.md',
    ]);
    expect(await paths({ q: 'posic', type: 'permanent' })).toEqual([
      '03-Permanent-Notes/Posicionar é escolher.md',
    ]);
    expect(await paths({ q: '', folder: '02-Sources' })).toEqual([
      '02-Sources/Books/Ação e reação.md',
    ]);
  });

  it('consulta maliciosa não injeta SQL', async () => {
    await indexed();
    expect(await searchNotes(db, { q: "'; drop table notes; -- & | ! :*" })).toEqual(
      expect.any(Array),
    );
    expect(await searchNotes(db, { q: 'posic', folder: "x%' or 1=1 --" })).toEqual([]);
    const count = await db.execute<{ n: number }>(sql`select count(*)::int as n from notes`);
    expect(count.rows[0]?.n).toBe(4);
  });

  it('sincronização incremental relê só o que mudou e conserta links quando a nota aparece', async () => {
    const { store, index } = await indexed();
    let reads = 0;
    const read = store.read.bind(store);
    store.read = async (path) => {
      reads++;
      return read(path);
    };
    expect(await index.sync()).toEqual({ added: 0, updated: 0, removed: 0, total: 4 });
    expect(reads).toBe(0);

    store.writeExternal('00-Inbox/Conceito futuro.md', 'agora existe');
    expect(await index.sync()).toMatchObject({ added: 1, updated: 0, removed: 0 });
    expect(reads).toBe(1);
    expect(await brokenLinks(db)).toEqual([]);
    expect(await referencingNotes(db, '00-Inbox/Conceito futuro.md')).toEqual([
      '03-Permanent-Notes/Posicionar é escolher.md',
    ]);
  });

  it('remoção some do índice e os links de outras notas voltam a ficar quebrados', async () => {
    const files = { ...VAULT } as Record<string, string>;
    delete files['04-Concepts/Posicionamento.md'];
    const { index } = await indexed();
    const store2 = new MemoryVaultStore(files);
    const result = await new NoteIndex(db, store2).sync();
    expect(result.removed).toBe(1);
    expect(await backlinksTo(db, '04-Concepts/Posicionamento.md')).toEqual([]);
    expect((await brokenLinks(db)).map((link) => link.targetRaw).sort()).toEqual([
      'Conceito futuro',
      'Positioning',
    ]);
    void index;
  });

  it('apply() registra gravações da aplicação sem reler o vault', async () => {
    const { store, index } = await indexed();
    let reads = 0;
    const list = store.list.bind(store);
    store.list = async () => {
      reads++;
      return list();
    };
    const content = 'nova nota que cita [[Ação e reação]]';
    await index.apply([{ path: '00-Inbox/Nova.md', content, sha: gitBlobShaOfText(content) }]);
    expect(reads).toBe(0);
    expect(
      (await backlinksTo(db, '02-Sources/Books/Ação e reação.md')).map((b) => b.sourcePath),
    ).toEqual(['00-Inbox/Nova.md']);

    // Criar a nota que faltava conserta links de OUTRAS notas.
    const futuro = 'conceito';
    await index.apply([
      { path: '04-Concepts/Conceito futuro.md', content: futuro, sha: gitBlobShaOfText(futuro) },
    ]);
    expect(await brokenLinks(db)).toEqual([]);

    await index.apply([{ path: '00-Inbox/Nova.md' }]);
    expect(await backlinksTo(db, '02-Sources/Books/Ação e reação.md')).toEqual([]);
    expect((await index.status()).noteCount).toBe(5);
  });

  it('sincronizações simultâneas são serializadas e o resultado é consistente', async () => {
    const store = new MemoryVaultStore(VAULT);
    const results = await Promise.all([
      new NoteIndex(db, store).sync(),
      new NoteIndex(db, store).sync(),
    ]);
    expect(results.map((r) => r.total)).toEqual([4, 4]);
    const count = await db.execute<{ n: number }>(sql`select count(*)::int as n from notes`);
    expect(count.rows[0]?.n).toBe(4);
    const linkCount = await db.execute<{ n: number }>(sql`select count(*)::int as n from links`);
    expect(linkCount.rows[0]?.n).toBe(3);
  });
  it('renomear usa o grafo do índice (sincronizado antes) e o índice acompanha o resultado', async () => {
    const { store, index } = await indexed();
    // Link criado fora da aplicação e ainda não indexado: a sincronização prévia o encontra.
    store.writeExternal('00-Inbox/Solta.md', 'agora cita [[Posicionamento#Definição]]');
    const writes: WrittenChange[][] = [];
    const service = new NotesService(store, {
      timeZone: 'America/Sao_Paulo',
      linkGraph: () => index.linkGraph(),
      onWrite: (changes) => writes.push(changes),
    });
    const result = await service.rename({
      path: '04-Concepts/Posicionamento.md',
      expectedSha: (await store.read('04-Concepts/Posicionamento.md')).sha,
      title: 'Proposta de valor',
      folder: '04-Concepts',
    });
    // [[Positioning]] resolve por alias e continua válido: só a nota com o nome antigo muda.
    expect(result.updatedNotes).toEqual(['00-Inbox/Solta.md']);
    expect((await store.read('00-Inbox/Solta.md')).content).toBe(
      'agora cita [[Proposta de valor#Definição]]',
    );

    for (const changes of writes) await index.apply(changes);
    expect(
      (await backlinksTo(db, '04-Concepts/Proposta de valor.md')).map((b) => b.sourcePath).sort(),
    ).toEqual(['00-Inbox/Solta.md', '03-Permanent-Notes/Posicionar é escolher.md']);
    expect(await referencingNotes(db, '04-Concepts/Posicionamento.md')).toEqual([]);
    // O índice incremental bate com uma sincronização completa.
    expect(await index.sync()).toMatchObject({ added: 0, updated: 0, removed: 0 });
  });
});
