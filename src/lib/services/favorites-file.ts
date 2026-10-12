import { z } from 'zod';

/** Caminho do arquivo de favoritos no vault (DATA_MODEL.md §5). */
export const FAVORITES_PATH = '.second-brain/favorites.json';

const fileSchema = z.object({ version: z.literal(1), notes: z.array(z.string()) });

/** Lista de favoritos, ou `null` se o arquivo não estiver no formato esperado (nunca sobrescrito). */
export function parseFavoritesFile(content: string): string[] | null {
  try {
    const result = fileSchema.safeParse(JSON.parse(content));
    return result.success ? result.data.notes : null;
  } catch {
    return null;
  }
}

export function serializeFavoritesFile(notes: readonly string[]): string {
  return `${JSON.stringify({ version: 1, notes }, null, 2)}\n`;
}
