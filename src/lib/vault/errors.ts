export type VaultErrorCode =
  | 'not_found'
  | 'already_exists'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable'
  | 'misconfigured'
  | 'unsupported_content'
  | 'too_large';

/** Erros da camada de persistência. A mensagem é segura para exibir; nunca contém dados do provedor. */
export class VaultError extends Error {
  override readonly name: string = 'VaultError';
  constructor(
    readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class NotFoundError extends VaultError {
  override readonly name = 'NotFoundError';
  constructor(message = 'Arquivo não encontrado no vault.') {
    super('not_found', message);
  }
}

export class AlreadyExistsError extends VaultError {
  override readonly name = 'AlreadyExistsError';
  constructor(message = 'Já existe um arquivo com esse nome.') {
    super('already_exists', message);
  }
}

export class ConflictError extends VaultError {
  override readonly name = 'ConflictError';
  constructor(
    /** SHA atual do arquivo, quando conhecido. */
    readonly currentSha: string | null = null,
    message = 'O arquivo foi alterado em outro lugar desde que foi aberto.',
  ) {
    super('conflict', message);
  }
}

export class VaultRateLimitedError extends VaultError {
  override readonly name = 'VaultRateLimitedError';
  constructor(readonly retryAfterSeconds: number | null) {
    super(
      'rate_limited',
      'Limite de requisições do provedor do vault atingido. Tente novamente em instantes.',
    );
  }
}

export class VaultUnavailableError extends VaultError {
  override readonly name = 'VaultUnavailableError';
  constructor(message = 'O vault está temporariamente indisponível.') {
    super('unavailable', message);
  }
}

export class VaultConfigError extends VaultError {
  override readonly name = 'VaultConfigError';
  constructor(message: string) {
    super('misconfigured', message);
  }
}

export class UnsupportedContentError extends VaultError {
  override readonly name = 'UnsupportedContentError';
  constructor(message = 'O arquivo não é texto UTF-8 e não pode ser editado como nota.') {
    super('unsupported_content', message);
  }
}

export class TooLargeError extends VaultError {
  override readonly name = 'TooLargeError';
  constructor(message = 'Arquivo grande demais.') {
    super('too_large', message);
  }
}
