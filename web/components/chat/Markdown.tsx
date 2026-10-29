'use client';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { createContext, useContext, type ReactNode } from 'react';
import { GlossaryTip } from '@/components/kb/GlossaryTip';
import { rehypeGlossary, type GlossaryEntry } from '@/lib/glossary-rehype';

// The definition popover keeps its open/closed state, so the span renderer must keep its identity between renders of the
// parent (a component created inside Markdown would be remounted on every chat re-render): a module-level component
// reads the term list from context.
const GlossaryContext = createContext<GlossaryEntry[] | undefined>(undefined);
function GlossarySpan({ children, ...rest }: { children?: ReactNode }) {
  const glossary = useContext(GlossaryContext);
  const slug = (rest as Record<string, unknown>)['data-glossary'];
  const entry = typeof slug === 'string' ? glossary?.find((g) => g.slug === slug) : undefined;
  return entry ? <GlossaryTip slug={entry.slug} def={entry.def}>{children}</GlossaryTip> : <span>{children}</span>;
}

// One stable `components` map for every render: react-markdown remounts a subtree whenever a renderer's identity changes,
// which would reset the open/closed state of a glossary popover on each re-render of a chat. Per-render inputs (citation
// handlers, glossary terms) reach the renderers through context.
type Handlers = { onCitation?: (n: number) => void; citationLabel?: (n: number) => string };
const MarkdownContext = createContext<Handlers>({});
const COMPONENTS: Components = {
  a: function Anchor({ href, children }) {
    const { onCitation, citationLabel } = useContext(MarkdownContext);
    const cite = href?.match(/^#(?:user-content-)?cite-(\d+)$/);
    if (cite) {
      const n = Number(cite[1]);
      return (
        <button
          type="button"
          onClick={() => onCitation?.(n)}
          aria-label={citationLabel?.(n)}
          className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary-050 px-1 align-[1px] text-xs font-semibold text-primary-700 hover:bg-primary/15"
        >
          {n}
        </button>
      );
    }
    if (href?.startsWith('/')) {
      return (
        <Link href={href} className="text-primary-700 underline underline-offset-2">
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-700 underline underline-offset-2">
        {children}
      </a>
    );
  },
  span: GlossarySpan,
  p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  h2: ({ children }) => <h2 className="mt-6 mb-2 font-serif text-lg font-bold text-navy dark:text-text">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-5 mb-1.5 text-base font-bold text-navy first:mt-0 dark:text-text">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-[0.9375rem] font-semibold">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-lg border-l-4 border-primary/40 bg-surface-2 px-4 py-2 text-[14.5px]">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  em: ({ children }) => <em className="text-muted not-italic">{children}</em>,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-sans text-[0.875rem] whitespace-pre-wrap">
      {children}
    </pre>
  ),
  code: ({ children }) => <code className="rounded bg-surface-2 px-1 py-0.5 text-[0.92em]">{children}</code>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto" tabIndex={0}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border bg-surface-2 px-2 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1.5 align-top">{children}</td>,
};

// LLM/user text is untrusted: rendered only through react-markdown + rehype-sanitize (CLAUDE.md rule 12).
// Citation markers "[n]" become chips; internal links (/law, /guides, …) stay in the app, external ones open a new tab.
export function Markdown({
  text,
  onCitation,
  citationLabel,
  glossary,
  glossarySkip,
}: {
  text: string;
  onCitation?: (n: number) => void;
  citationLabel?: (n: number) => string;
  /** terms to underline with a hover definition (first mention only) */
  glossary?: GlossaryEntry[];
  glossarySkip?: string[];
}) {
  const withChips = onCitation ? text.replace(/\[(\d{1,2})\](?!\()/g, '[$1](#cite-$1)') : text;
  return (
    <MarkdownContext.Provider value={{ onCitation, citationLabel }}>
    <GlossaryContext.Provider value={glossary}>
    <div className="text-[0.9375rem] leading-relaxed [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={glossary?.length ? [rehypeSanitize, [rehypeGlossary, { entries: glossary, skip: glossarySkip }]] : [rehypeSanitize]}
        components={COMPONENTS}
      >
        {withChips}
      </ReactMarkdown>
    </div>
    </GlossaryContext.Provider>
    </MarkdownContext.Provider>
  );
}
