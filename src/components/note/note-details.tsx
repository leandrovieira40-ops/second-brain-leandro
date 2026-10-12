'use client';

import { HashIcon, LinkIcon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import type { ParsedNote } from '@/lib/notes/parse';
import type { LinkResolver } from '@/lib/notes/resolve';
import { noteHref } from '../vault-context';

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(formatValue).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Painel direito: propriedades, tags e links de saída calculados do texto atual. */
export function NoteDetails({ note, resolver }: { note: ParsedNote; resolver: LinkResolver }) {
  const links = note.links.map((link) => ({
    link,
    resolution: resolver.resolve(link.target, note.path),
  }));
  const broken = links.filter((item) => !item.resolution.path);

  return (
    <div className="space-y-6 p-4 text-sm">
      <section aria-labelledby="props-heading" className="space-y-2">
        <h2
          id="props-heading"
          className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
        >
          Propriedades
        </h2>
        {note.frontmatterError ? (
          <p className="bg-warning-surface flex gap-2 rounded p-2 text-xs" role="alert">
            <TriangleAlertIcon className="text-warning mt-0.5 size-3.5 shrink-0" />
            <span>
              O frontmatter tem um erro de YAML ({note.frontmatterError.split('\n')[0]}). A nota
              continua sendo salva normalmente.
            </span>
          </p>
        ) : note.frontmatter && Object.keys(note.frontmatter).length > 0 ? (
          <dl className="grid grid-cols-[minmax(0,6rem)_1fr] gap-x-3 gap-y-1">
            {Object.entries(note.frontmatter).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground truncate" title={key}>
                  {key}
                </dt>
                <dd className="min-w-0 break-words">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground text-xs">Sem frontmatter.</p>
        )}
      </section>

      <section aria-labelledby="tags-heading" className="space-y-2">
        <h2
          id="tags-heading"
          className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
        >
          Tags
        </h2>
        {note.tags.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {note.tags.map((tag) => (
              <li
                key={tag}
                className="bg-muted inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs"
              >
                <HashIcon className="size-3" />
                {tag}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">Nenhuma tag.</p>
        )}
      </section>

      <section aria-labelledby="links-heading" className="space-y-2">
        <h2
          id="links-heading"
          className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
        >
          Links de saída ({links.length}){broken.length ? ` · ${broken.length} sem destino` : ''}
        </h2>
        {links.length ? (
          <ul className="space-y-1">
            {links.map(({ link, resolution }, index) => (
              <li key={`${link.start}-${index}`} className="flex items-start gap-1.5">
                <LinkIcon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                {resolution.path ? (
                  <span className="min-w-0">
                    <Link href={noteHref(resolution.path)} className="wikilink break-words">
                      {link.alias ?? link.target}
                    </Link>
                    {resolution.ambiguous ? (
                      <span
                        className="text-warning ml-1 text-xs"
                        title={resolution.candidates.join('\n')}
                      >
                        (ambíguo)
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span
                    className="wikilink-broken break-words"
                    title="Nenhum arquivo com esse nome. Aliases de outras notas ainda não são considerados."
                  >
                    {link.target || link.raw} <span className="text-xs">(não encontrada)</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">Nenhum [[link]] nesta nota.</p>
        )}
      </section>
    </div>
  );
}
