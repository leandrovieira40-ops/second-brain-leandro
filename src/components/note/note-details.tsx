'use client';

import { HashIcon, LinkIcon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import type { ParsedNote } from '@/lib/notes/parse';
import {
  formatPropertyValue,
  friendlyPropertyValue,
  isTemplateNote,
  propertyLabel,
  TECHNICAL_PROPERTIES,
} from '@/lib/notes/property-display';
import { NOTE_TYPE_LABELS } from '@/lib/notes/types';
import type { LinkResolver } from '@/lib/notes/resolve';
import { noteHref } from '../vault-context';

/** Painel direito: propriedades, tags e links de saída calculados do texto atual. */
export function NoteDetails({
  note,
  resolver,
  onCreateNote,
  rawFrontmatter,
  localGraph,
  backlinks,
  history,
}: {
  note: ParsedNote;
  /** Texto YAML do frontmatter (para reconhecer modelos com `{{…}}`). */
  rawFrontmatter: string | null;
  resolver: LinkResolver;
  onCreateNote: (title: string) => void;
  /** Grafo local (vem do índice). */
  localGraph: React.ReactNode;
  /** Links de entrada (vêm do índice). */
  backlinks: React.ReactNode;
  /** Seção de histórico (vem da área da nota, que sabe restaurar versões). */
  history: React.ReactNode;
}) {
  const links = note.links.map((link) => ({
    link,
    resolution: resolver.resolve(link.target, note.path),
  }));
  const broken = links.filter((item) => !item.resolution.path);

  return (
    <div className="space-y-6 p-4 text-sm">
      {isTemplateNote(note.path, rawFrontmatter) ? (
        <p className="bg-accent text-accent-foreground rounded p-2 text-xs">
          Este arquivo é um <strong>modelo</strong>. Os campos entre {'{{ }}'} são preenchidos pelo
          Obsidian ao criar uma nota a partir dele.
        </p>
      ) : null}
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
          <PropertyList
            frontmatter={note.frontmatter}
            template={isTemplateNote(note.path, rawFrontmatter)}
          />
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
                  <span className="min-w-0">
                    <span
                      className="wikilink-broken break-words"
                      title="Nenhum arquivo com esse nome. Aliases de outras notas ainda não são considerados."
                    >
                      {link.target || link.raw}
                    </span>{' '}
                    {link.target ? (
                      <button
                        type="button"
                        className="text-primary text-xs underline underline-offset-2"
                        onClick={() => onCreateNote(link.target)}
                      >
                        criar nota
                      </button>
                    ) : null}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">Nenhum [[link]] nesta nota.</p>
        )}
      </section>

      {localGraph}

      {backlinks}

      {history}
    </div>
  );
}

function PropertyList({
  frontmatter,
  template,
}: {
  frontmatter: Record<string, unknown>;
  /** Em modelos, mostra os valores como escritos ({{date}}…). */
  template: boolean;
}) {
  const entries = Object.entries(frontmatter);
  const main = entries.filter(([key]) => !TECHNICAL_PROPERTIES.has(key) && key !== 'title');
  const technical = entries.filter(([key]) => TECHNICAL_PROPERTIES.has(key));
  const value = (key: string, raw: unknown) =>
    template ? formatPropertyValue(raw) : friendlyPropertyValue(key, raw, NOTE_TYPE_LABELS);
  const rows = (items: [string, unknown][]) => (
    <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-1.5">
      {items.map(([key, raw]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground truncate" title={key}>
            {propertyLabel(key)}
          </dt>
          <dd className="min-w-0 break-words">{value(key, raw)}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="space-y-2">
      {rows(main)}
      {technical.length ? (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer select-none">
            Informações técnicas
          </summary>
          <div className="mt-2 break-all">{rows(technical)}</div>
        </details>
      ) : null}
    </div>
  );
}
