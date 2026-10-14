'use client';

import { useRef } from 'react';

/**
 * Título grande e editável, como no Notion: clique, escreva e aperte Enter. Mudar o título renomeia
 * a nota (o servidor atualiza os [[links]] para ela no mesmo commit).
 */
export function NoteTitle({
  title,
  disabled,
  onCommit,
  onEnter,
}: {
  title: string;
  disabled?: boolean;
  /** Chamado com o novo título quando ele muda (Enter ou ao sair do campo). */
  onCommit: (title: string) => void;
  /** Depois do Enter: o foco vai para o texto da nota. */
  onEnter?: () => void;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  function commit() {
    const element = ref.current;
    if (!element) return;
    const next = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!next) {
      element.textContent = title;
      return;
    }
    if (next !== title) onCommit(next);
  }

  return (
    // `key`: um título novo (renomeação) recria o elemento editado à mão pelo navegador.
    <h1
      key={title}
      ref={ref}
      contentEditable={disabled ? false : 'plaintext-only'}
      suppressContentEditableWarning
      spellCheck
      lang="pt-BR"
      title={disabled ? undefined : 'Clique para mudar o título'}
      data-testid="note-title"
      className="text-foreground rounded-md text-3xl leading-tight font-bold tracking-tight break-words outline-none sm:text-4xl"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
          onEnter?.();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.currentTarget.textContent = title;
          event.currentTarget.blur();
        }
      }}
      onBlur={commit}
    >
      {title}
    </h1>
  );
}
