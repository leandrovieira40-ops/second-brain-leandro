import { createHash } from 'node:crypto';
import { UnsupportedContentError } from './errors';

const encoder = new TextEncoder();
// `ignoreBOM: true` mantém o BOM no texto, para que ler e gravar não altere os bytes do arquivo.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export function encodeText(content: string): Uint8Array {
  return encoder.encode(content);
}

export function decodeText(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new UnsupportedContentError();
  }
}

/** SHA-1 de blob do Git: `sha1("blob <tamanho>\0" + bytes)` — o mesmo valor que o GitHub reporta. */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

export function gitBlobShaOfText(content: string): string {
  return gitBlobSha(encodeText(content));
}
