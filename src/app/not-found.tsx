import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="text-muted-foreground text-sm">O endereço não corresponde a nenhuma página.</p>
      <Link href="/" className="text-primary text-sm underline underline-offset-4">
        Voltar ao início
      </Link>
    </main>
  );
}
