import type { Metadata } from 'next';
import Link from 'next/link';
import { NoteWorkspace } from '@/components/note/note-workspace';
import { requireSession } from '@/lib/auth/guard';
import { getNotesService } from '@/lib/services';
import { NotFoundError, VaultError } from '@/lib/vault/errors';
import { InvalidPathError, noteName } from '@/lib/vault/paths';

type Props = { searchParams: Promise<{ path?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { path } = await searchParams;
  return { title: path ? noteName(path) : 'Nota' };
}

export default async function NotePage({ searchParams }: Props) {
  await requireSession();
  const { path } = await searchParams;
  if (!path)
    return <Message title="Nenhuma nota selecionada" text="Escolha uma nota na barra lateral." />;
  let note: Awaited<ReturnType<ReturnType<typeof getNotesService>['read']>>;
  try {
    note = await getNotesService().read(path);
  } catch (error) {
    const failure = describeFailure(error, path);
    if (!failure) throw error;
    return <Message {...failure} />;
  }
  return <NoteWorkspace key={note.path} note={note} />;
}

function describeFailure(error: unknown, path: string): { title: string; text: string } | null {
  if (error instanceof NotFoundError) {
    return {
      title: 'Nota não encontrada',
      text: `Não existe "${path}" no vault. Ela pode ter sido movida ou removida.`,
    };
  }
  if (error instanceof InvalidPathError) return { title: 'Endereço inválido', text: error.message };
  if (error instanceof VaultError)
    return { title: 'Não foi possível abrir a nota', text: error.message };
  return null;
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-lg space-y-2 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-muted-foreground text-sm">{text}</p>
      <Link href="/" className="text-primary text-sm underline underline-offset-4">
        Voltar ao início
      </Link>
    </div>
  );
}
