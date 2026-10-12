import { z } from 'zod';
import { NOTE_TYPES } from '@/lib/notes/types';
import { MAX_NOTE_BYTES } from '@/lib/services/notes';

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
]);

export const saveNoteSchema = z.object({
  path,
  content,
  expectedSha: z.string().regex(/^[0-9a-f]{40}$/),
});

export type CreateNoteRequest = z.infer<typeof createNoteSchema>;
export type SaveNoteRequest = z.infer<typeof saveNoteSchema>;
