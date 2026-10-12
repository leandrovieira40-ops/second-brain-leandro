/**
 * Máquina de estados do salvamento de uma nota (ADR-0008), independente de React.
 *
 * Garantias:
 * - `saved` só depois que o servidor confirma o novo SHA do exato conteúdo enviado;
 * - uma gravação por vez; alterações feitas durante a gravação geram outra;
 * - autosave após `idleMs` sem digitar, respeitando `minIntervalMs` entre commits automáticos;
 * - conflito pausa o autosave até uma decisão explícita do usuário;
 * - erros transitórios são repetidos com backoff, sem nunca indicar sucesso.
 */

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export type SaveOutcome =
  | { kind: 'saved'; sha: string }
  | { kind: 'conflict'; currentSha: string | null; message: string }
  | { kind: 'error'; message: string; retryable: boolean };

export interface SaveState {
  status: SaveStatus;
  /** SHA da última versão confirmada no servidor (base da próxima gravação). */
  baseSha: string;
  /** Há alterações que ainda não foram confirmadas. */
  unsaved: boolean;
  message: string | null;
  lastSavedAt: number | null;
  nextRetryAt: number | null;
}

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SaveControllerOptions {
  path: string;
  initialContent: string;
  initialSha: string;
  save: (request: {
    path: string;
    content: string;
    expectedSha: string;
    manual: boolean;
  }) => Promise<SaveOutcome>;
  /** Ajusta o conteúdo logo antes de enviar (ex.: campo `updated`). Deve aplicar a mudança ao editor. */
  beforeSave?: (content: string) => string;
  idleMs?: number;
  minIntervalMs?: number;
  retryDelaysMs?: number[];
  clock?: Clock;
}

const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class SaveController {
  private state: SaveState;
  private current: string;
  private saved: string;
  private inFlight = false;
  private pendingManual = false;
  private timer: unknown = null;
  private lastAutoCommitAt = Number.NEGATIVE_INFINITY;
  private retryAttempt = 0;
  private disposed = false;
  private readonly listeners = new Set<(state: SaveState) => void>();
  private readonly clock: Clock;
  private readonly idleMs: number;
  private readonly minIntervalMs: number;
  private readonly retryDelaysMs: number[];

  constructor(private readonly options: SaveControllerOptions) {
    this.clock = options.clock ?? systemClock;
    this.idleMs = options.idleMs ?? 4_000;
    this.minIntervalMs = options.minIntervalMs ?? 30_000;
    this.retryDelaysMs = options.retryDelaysMs ?? [5_000, 15_000, 30_000, 60_000];
    this.current = options.initialContent;
    this.saved = options.initialContent;
    this.state = {
      status: 'saved',
      baseSha: options.initialSha,
      unsaved: false,
      message: null,
      lastSavedAt: null,
      nextRetryAt: null,
    };
  }

  getState(): SaveState {
    return this.state;
  }

  /** Conteúdo atual do editor (inclui alterações não salvas). */
  getContent(): string {
    return this.current;
  }

  subscribe(listener: (state: SaveState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Chamado a cada alteração no editor. */
  edit(content: string): void {
    if (this.disposed) return;
    this.current = content;
    const unsaved = content !== this.saved;
    if (this.state.status === 'conflict' || this.state.status === 'error') {
      this.update({ unsaved });
      if (this.state.status === 'error') this.scheduleAuto();
      return;
    }
    if (this.inFlight) {
      this.update({ unsaved: true });
      return;
    }
    this.update({ status: unsaved ? 'dirty' : 'saved', unsaved, message: null });
    if (unsaved) this.scheduleAuto();
    else this.clearTimer();
  }

  /** Ctrl/Cmd+S ou saída da página: grava já (respeitando uma gravação por vez). */
  saveNow(): void {
    if (this.disposed || this.state.status === 'conflict') return;
    if (this.inFlight) {
      this.pendingManual = true;
      return;
    }
    this.clearTimer();
    if (this.current === this.saved && this.state.status !== 'error') return;
    void this.run(true);
  }

  /** Após resolver um conflito (recarregar remoto, sobrescrever ou salvar cópia). */
  reset(content: string, sha: string, editorContent: string = content): void {
    this.clearTimer();
    this.saved = content;
    this.current = editorContent;
    this.retryAttempt = 0;
    const unsaved = editorContent !== content;
    this.update({
      status: unsaved ? 'dirty' : 'saved',
      baseSha: sha,
      unsaved,
      message: null,
      nextRetryAt: null,
      lastSavedAt: this.clock.now(),
    });
    if (unsaved) this.scheduleAuto();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.listeners.clear();
  }

  private scheduleAuto(): void {
    this.clearTimer();
    const now = this.clock.now();
    const earliest = Math.max(now + this.idleMs, this.lastAutoCommitAt + this.minIntervalMs);
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.run(false);
    }, earliest - now);
  }

  private clearTimer(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(manual: boolean): Promise<void> {
    if (this.inFlight || this.disposed || this.state.status === 'conflict') return;
    if (this.current === this.saved && this.state.status !== 'error') {
      this.update({ status: 'saved', unsaved: false });
      return;
    }
    if (this.options.beforeSave) {
      this.current = this.options.beforeSave(this.current);
      // O ajuste passa pelo editor e chama `edit()`, que agendaria outro autosave à toa.
      this.clearTimer();
    }
    const content = this.current;
    const expectedSha = this.state.baseSha;
    this.inFlight = true;
    this.pendingManual = false;
    if (!manual) this.lastAutoCommitAt = this.clock.now();
    this.update({ status: 'saving', message: null, nextRetryAt: null });

    let outcome: SaveOutcome;
    try {
      outcome = await this.options.save({ path: this.options.path, content, expectedSha, manual });
    } catch {
      outcome = {
        kind: 'error',
        message: 'Falha de rede. Nada foi salvo no vault.',
        retryable: true,
      };
    }
    this.inFlight = false;
    if (this.disposed) return;

    if (outcome.kind === 'saved') {
      this.saved = content;
      this.retryAttempt = 0;
      const unsaved = this.current !== content;
      this.update({
        status: unsaved ? 'dirty' : 'saved',
        baseSha: outcome.sha,
        unsaved,
        message: null,
        lastSavedAt: this.clock.now(),
      });
      if (unsaved) {
        if (this.pendingManual) void this.run(true);
        else this.scheduleAuto();
      }
      return;
    }

    if (outcome.kind === 'conflict') {
      this.clearTimer();
      this.update({ status: 'conflict', unsaved: true, message: outcome.message });
      return;
    }

    const delay = outcome.retryable
      ? this.retryDelaysMs[Math.min(this.retryAttempt, this.retryDelaysMs.length - 1)]
      : undefined;
    this.retryAttempt++;
    this.update({
      status: 'error',
      unsaved: true,
      message: outcome.message,
      nextRetryAt: delay === undefined ? null : this.clock.now() + delay,
    });
    if (delay !== undefined) {
      this.clearTimer();
      this.timer = this.clock.setTimeout(() => {
        this.timer = null;
        void this.run(false);
      }, delay);
    }
  }

  private update(patch: Partial<SaveState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }
}
