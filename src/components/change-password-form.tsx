'use client';

import { KeyRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, changePassword } from '@/lib/client/api';

const MIN_LENGTH = 12;

/** Troca de senha: exige a atual; os outros aparelhos são desconectados. */
export function ChangePasswordForm({ available }: { available: boolean }) {
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('current') ?? '');
    const newPassword = String(data.get('new') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    if (newPassword.length < MIN_LENGTH) {
      setMessage({
        text: `A senha nova precisa ter pelo menos ${MIN_LENGTH} caracteres.`,
        error: true,
      });
      return;
    }
    if (newPassword !== confirm) {
      setMessage({ text: 'A confirmação não é igual à senha nova.', error: true });
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      await changePassword({ currentPassword, newPassword });
      form.reset();
      setMessage({
        text: 'Senha trocada. Outros aparelhos conectados precisarão entrar com a senha nova.',
        error: false,
      });
    } catch (error) {
      setMessage({
        text: error instanceof ApiError ? error.message : 'Sem conexão: a senha não foi trocada.',
        error: true,
      });
    }
    setPending(false);
  }

  return (
    <section className="space-y-4 rounded-lg border p-5" aria-labelledby="password-heading">
      <h2 id="password-heading" className="flex items-center gap-2 font-semibold">
        <KeyRoundIcon className="size-4" /> Trocar senha
      </h2>
      {!available ? (
        <p className="text-muted-foreground text-sm">
          Para trocar a senha pelo aplicativo, configure o banco (DATABASE_URL). Sem ele, a senha é
          trocada pela variável AUTH_PASSWORD_HASH na Vercel.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Senha atual</Label>
            <Input
              id="current-password"
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Senha nova</Label>
            <Input
              id="new-password"
              name="new"
              type="password"
              autoComplete="new-password"
              minLength={MIN_LENGTH}
              required
            />
            <p className="text-muted-foreground text-xs">
              Pelo menos {MIN_LENGTH} caracteres. Uma frase com palavras é fácil de lembrar e
              difícil de adivinhar.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirme a senha nova</Label>
            <Input
              id="confirm-password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          {message ? (
            <p
              role={message.error ? 'alert' : 'status'}
              className={message.error ? 'text-destructive text-sm' : 'text-sm'}
            >
              {message.text}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Trocando…' : 'Trocar senha'}
          </Button>
        </form>
      )}
    </section>
  );
}
