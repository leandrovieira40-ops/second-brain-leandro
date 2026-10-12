import { describe, expect, it } from 'vitest';
import { SaveController, type Clock, type SaveOutcome } from './save-controller';

class FakeClock implements Clock {
  time = 0;
  private timers = new Map<number, { at: number; callback: () => void }>();
  private seq = 0;
  now = () => this.time;
  setTimeout = (callback: () => void, ms: number) => {
    const id = ++this.seq;
    this.timers.set(id, { at: this.time + ms, callback });
    return id;
  };
  clearTimeout = (handle: unknown) => {
    this.timers.delete(handle as number);
  };
  /** Avança o relógio executando os timers vencidos. */
  async advance(ms: number) {
    const target = this.time + ms;
    for (;;) {
      const next = [...this.timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.timers.delete(next[0]);
      this.time = next[1].at;
      next[1].callback();
      await flush();
    }
    this.time = target;
    await flush();
  }
  pending() {
    return this.timers.size;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(
  responder?: (request: { content: string; expectedSha: string }) => Promise<SaveOutcome>,
) {
  const clock = new FakeClock();
  const calls: { content: string; expectedSha: string; manual: boolean }[] = [];
  let shaCounter = 0;
  const controller = new SaveController({
    path: 'a.md',
    initialContent: 'v0',
    initialSha: 'sha-0',
    clock,
    idleMs: 4_000,
    minIntervalMs: 30_000,
    retryDelaysMs: [5_000, 15_000],
    save: async (request) => {
      calls.push(request);
      if (responder) return responder(request);
      return { kind: 'saved', sha: `sha-${++shaCounter}` };
    },
  });
  return { clock, calls, controller };
}

describe('SaveController', () => {
  it('não grava nada sem alterações e volta a "saved" ao desfazer', async () => {
    const { controller, calls, clock } = setup();
    controller.edit('v1');
    expect(controller.getState()).toMatchObject({ status: 'dirty', unsaved: true });
    controller.edit('v0');
    expect(controller.getState()).toMatchObject({ status: 'saved', unsaved: false });
    await clock.advance(60_000);
    expect(calls).toHaveLength(0);
  });

  it('autosave após 4 s sem digitar e só então marca "saved" com o novo SHA', async () => {
    const { controller, calls, clock } = setup();
    controller.edit('v1');
    await clock.advance(3_999);
    expect(calls).toHaveLength(0);
    controller.edit('v12');
    await clock.advance(3_999);
    expect(calls).toHaveLength(0);
    await clock.advance(1);
    expect(calls).toEqual([{ path: 'a.md', content: 'v12', expectedSha: 'sha-0', manual: false }]);
    expect(controller.getState()).toMatchObject({
      status: 'saved',
      baseSha: 'sha-1',
      unsaved: false,
    });
  });

  it('respeita o intervalo mínimo de 30 s entre commits automáticos', async () => {
    const { controller, calls, clock } = setup();
    controller.edit('v1');
    await clock.advance(4_000);
    expect(calls).toHaveLength(1);
    controller.edit('v2');
    await clock.advance(10_000);
    expect(calls).toHaveLength(1);
    await clock.advance(19_999); // primeiro commit em t=4 s → próximo só em t=34 s
    expect(calls).toHaveLength(1);
    await clock.advance(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ content: 'v2', expectedSha: 'sha-1' });
  });

  it('Ctrl+S grava imediatamente, ignorando o intervalo mínimo', async () => {
    const { controller, calls, clock } = setup();
    controller.edit('v1');
    await clock.advance(4_000);
    controller.edit('v2');
    controller.saveNow();
    await flush();
    expect(calls.map((c) => [c.content, c.manual])).toEqual([
      ['v1', false],
      ['v2', true],
    ]);
  });

  it('uma gravação por vez: edições durante a gravação geram outra com o SHA novo', async () => {
    const pending = deferred<SaveOutcome>();
    let first = true;
    const { controller, calls, clock } = setup(async () => {
      if (first) {
        first = false;
        return pending.promise;
      }
      return { kind: 'saved', sha: 'sha-2' };
    });
    controller.edit('v1');
    controller.saveNow();
    expect(controller.getState().status).toBe('saving');
    controller.edit('v1 + mais');
    controller.saveNow(); // enfileirado, não dispara outra requisição em paralelo
    expect(calls).toHaveLength(1);
    pending.resolve({ kind: 'saved', sha: 'sha-1' });
    await flush();
    await flush();
    expect(calls.map((c) => [c.content, c.expectedSha])).toEqual([
      ['v1', 'sha-0'],
      ['v1 + mais', 'sha-1'],
    ]);
    await clock.advance(0);
    expect(controller.getState()).toMatchObject({ status: 'saved', baseSha: 'sha-2' });
  });

  it('falha de rede nunca vira "saved" e é repetida com backoff (cenário F)', async () => {
    let fail = 2;
    const { controller, calls, clock } = setup(async () => {
      if (fail-- > 0) throw new TypeError('Failed to fetch');
      return { kind: 'saved', sha: 'sha-ok' };
    });
    controller.edit('v1');
    controller.saveNow();
    await flush();
    expect(controller.getState()).toMatchObject({
      status: 'error',
      unsaved: true,
      nextRetryAt: 5_000,
    });
    await clock.advance(5_000);
    expect(controller.getState().status).toBe('error');
    await clock.advance(15_000);
    expect(calls).toHaveLength(3);
    expect(controller.getState()).toMatchObject({
      status: 'saved',
      baseSha: 'sha-ok',
      unsaved: false,
    });
  });

  it('conflito pausa o autosave até reset explícito', async () => {
    const { controller, calls, clock } = setup(async () => ({
      kind: 'conflict',
      currentSha: 'sha-remoto',
      message: 'alterado em outro lugar',
    }));
    controller.edit('v1');
    controller.saveNow();
    await flush();
    expect(controller.getState()).toMatchObject({ status: 'conflict', unsaved: true });
    controller.edit('v1 continua');
    controller.saveNow();
    await clock.advance(120_000);
    expect(calls).toHaveLength(1);
    expect(controller.getContent()).toBe('v1 continua');

    controller.reset('remoto', 'sha-remoto');
    expect(controller.getState()).toMatchObject({
      status: 'saved',
      baseSha: 'sha-remoto',
      unsaved: false,
    });
    expect(controller.getContent()).toBe('remoto');
  });

  it('aplica beforeSave ao conteúdo enviado', async () => {
    const clock = new FakeClock();
    const sent: string[] = [];
    const controller = new SaveController({
      path: 'a.md',
      initialContent: 'updated: 2026-01-01',
      initialSha: 's0',
      clock,
      beforeSave: (content) => content.replace('2026-01-01', '2026-10-12'),
      save: async ({ content }) => {
        sent.push(content);
        return { kind: 'saved', sha: 's1' };
      },
    });
    controller.edit('updated: 2026-01-01\ntexto');
    controller.saveNow();
    await flush();
    expect(sent).toEqual(['updated: 2026-10-12\ntexto']);
    expect(controller.getState().status).toBe('saved');
    expect(clock.pending()).toBe(0);
  });
});
