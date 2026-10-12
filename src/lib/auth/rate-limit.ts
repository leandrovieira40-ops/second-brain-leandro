/**
 * Contador de janela deslizante em memória. Em serverless cada instância tem o seu, por isso é uma
 * defesa de melhor esforço — complementada por regra no Firewall da Vercel (ADR-0005).
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Quanto tempo falta para liberar `key` (0 = liberado). */
  retryAfterMs(key: string, now = Date.now()): number {
    const recent = this.recent(key, now);
    if (recent.length < this.limit) return 0;
    return Math.max(0, recent[0]! + this.windowMs - now);
  }

  record(key: string, now = Date.now()): void {
    const recent = this.recent(key, now);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (list.length === 0) this.hits.delete(key);
    return list;
  }
}
