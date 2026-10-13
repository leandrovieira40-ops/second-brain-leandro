'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseFrontmatter } from '@/lib/notes/frontmatter';
import { remarkWikilinks } from '@/lib/notes/remark-wikilinks';
import type { LinkResolver } from '@/lib/notes/resolve';
import { dirname } from '@/lib/vault/paths';
import { noteHref } from '../vault-context';

/**
 * Visualização segura: sem HTML bruto (react-markdown ignora HTML por padrão), URLs perigosas são
 * neutralizadas e imagens externas não são carregadas (privacidade + CSP).
 */
export function MarkdownPreview({
  content,
  path,
  resolver,
  onCreateNote,
}: {
  content: string;
  path: string;
  resolver: LinkResolver;
  /** Chamado ao clicar num link quebrado: abre "nova nota" com esse título. */
  onCreateNote: (title: string) => void;
}) {
  const body = useMemo(() => parseFrontmatter(content).body, [content]);

  const components = useMemo<Components>(
    () => ({
      a({ href, children, className, title }) {
        if (href?.startsWith('/note?')) {
          return (
            <Link href={href} className={className} title={title}>
              {children}
            </Link>
          );
        }
        if (href && /^https?:\/\//i.test(href)) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
              {children}
            </a>
          );
        }
        // Link Markdown relativo para outra nota do vault: [texto](pasta/Nota.md)
        if (href && !href.startsWith('#') && /\.md$/i.test(safeDecode(href.split('#')[0] ?? ''))) {
          const relative = safeDecode(href.split('#')[0]!);
          const base = dirname(path);
          const candidate = normalizeRelative(base ? `${base}/${relative}` : relative);
          const resolved = resolver.resolve(candidate ?? relative, path).path;
          if (resolved)
            return (
              <Link href={noteHref(resolved)} className="wikilink">
                {children}
              </Link>
            );
          return (
            <span className="wikilink-broken" title="Arquivo não encontrado no vault">
              {children}
            </span>
          );
        }
        return (
          <a href={href} className={className}>
            {children}
          </a>
        );
      },
      // Só o plugin de wikilinks gera <button> (o HTML do usuário é ignorado).
      button({ children, className, title, ...props }) {
        const target = (props as Record<string, unknown>)['data-wikilink-target'];
        return (
          <button
            type="button"
            className={className}
            title={title}
            onClick={() => typeof target === 'string' && onCreateNote(target)}
          >
            {children}
          </button>
        );
      },
      img({ src, alt }) {
        const source = typeof src === 'string' ? src : '';
        return (
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-muted-foreground text-sm"
          >
            🖼 {alt || 'imagem'}{' '}
            <span className="text-xs">(imagens não são carregadas na Fase 1)</span>
          </a>
        );
      },
    }),
    [path, resolver, onCreateNote],
  );

  return (
    <article className="prose prose-neutral dark:prose-invert prose-headings:tracking-tight prose-a:underline-offset-2 max-w-none px-6 py-6">
      {body.trim() ? (
        <Markdown
          remarkPlugins={[
            remarkGfm,
            [remarkWikilinks, { resolver, fromPath: path, hrefFor: noteHref }],
          ]}
          components={components}
        >
          {body}
        </Markdown>
      ) : (
        <p className="text-muted-foreground">Nota vazia.</p>
      )}
    </article>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeRelative(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}
