import { z } from 'zod';
import { NOTE_TYPES } from '@/lib/notes/types';
import { MAX_CAPTURE_CHARS, MAX_NOTE_BYTES } from '@/lib/services/notes';

/** Contratos JSON da API de notas (validados no servidor; o cliente usa os mesmos tipos). */
const content = z.string().max(MAX_NOTE_BYTES);
const path = z.string().min(1).max(400);

export const createNoteSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('new'),
    title: z.string().trim().min(1).max(200),
    folder: z.string().max(400),
    type: z.enum(NOTE_TYPES),
  }),
  z.object({ mode: z.literal('conflict-copy'), sourcePath: path, content }),
  z.object({ mode: z.literal('capture'), text: z.string().min(1).max(MAX_CAPTURE_CHARS) }),
]);

const sha = z.string().regex(/^[0-9a-f]{40}$/);

export const pathQuerySchema = z.object({ path });
export const versionQuerySchema = z.object({ path, commit: sha });
export const trashNoteSchema = z.object({ path, expectedSha: sha });
export const restoreVersionSchema = z.object({ path, commitSha: sha, expectedSha: sha });
export const trashItemSchema = z.object({ trashPath: path });
export const purgeSchema = z.object({ trashPath: path, expectedSha: sha });
export const favoriteSchema = z.object({ path, favorite: z.boolean() });
export const emptyQuerySchema = z.object({});

export const saveNoteSchema = z.object({
  path,
  content,
  expectedSha: z.string().regex(/^[0-9a-f]{40}$/),
});

export type CreateNoteRequest = z.infer<typeof createNoteSchema>;
export type SaveNoteRequest = z.infer<typeof saveNoteSchema>;

export const searchQuerySchema = z.object({
  q: z.string().max(200).default(''),
  type: z.string().max(40).optional(),
  tag: z.string().max(100).optional(),
  folder: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
