'use client'

import { Children, isValidElement, type ReactNode } from 'react'
import Link from 'next/link'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeUrlTransform } from '@/lib/ai/assistant-markdown-url'
import { cn } from '@/lib/utils'

// Raw HTML is never rendered: skipHtml is set and no rehype-raw plugin is used.

const NUMERIC_CELL = /^[\s(+−-]*[$€£]?\s*[\d.,]+\s*(%|[kKmM])?\)?\s*$/

function plainText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child)
      if (isValidElement<{ children?: ReactNode }>(child)) return plainText(child.props.children)
      return ''
    })
    .join('')
}

/** Numbers and money line up on the right unless the author set an explicit column alignment. */
function cellAlign(children: ReactNode, explicit?: string) {
  if (explicit === 'right') return 'text-right'
  if (explicit === 'center') return 'text-center'
  if (explicit === 'left') return 'text-left'
  return NUMERIC_CELL.test(plainText(children)) ? 'text-right tabular-nums' : 'text-left'
}

const components: Components = {
  h1: ({ children }) => <h3 className="mt-4 text-[0.9375rem] font-semibold leading-snug text-foreground first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 text-[0.9375rem] font-semibold leading-snug text-foreground first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3.5 text-sm font-semibold leading-snug text-foreground first:mt-0">{children}</h4>,
  h4: ({ children }) => (
    <h5 className="mt-3 text-xs font-semibold text-muted-foreground first:mt-0">{children}</h5>
  ),
  p: ({ children }) => <p className="text-pretty leading-relaxed [&:not(:first-child)]:mt-2.5">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 first:mt-0 [&_ul]:mt-1.5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 first:mt-0 [&_ol]:mt-1.5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 leading-relaxed marker:text-muted-foreground [&>p]:mt-0">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-3.5 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="mt-2.5 border-l-2 border-primary/30 pl-3 text-muted-foreground first:mt-0">{children}</blockquote>
  ),
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>
    const className = 'font-medium text-primary underline underline-offset-2 [overflow-wrap:anywhere] hover:text-brand-deep'
    if (href.startsWith('/')) {
      return (
        <Link href={href} className={className}>
          {children}
        </Link>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  },
  code: ({ className, children }) => {
    const isBlock = typeof className === 'string' && className.startsWith('language-')
    if (isBlock) return <code className={className}>{children}</code>
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{children}</code>
  },
  pre: ({ children }) => (
    <pre className="mt-2.5 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed first:mt-0">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="mt-2.5 w-full max-w-full overflow-x-auto rounded-lg border first:mt-0">
      <table className="w-full border-collapse text-[0.8125rem]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children, style }) => (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b px-2.5 py-1.5 text-xs font-semibold text-foreground',
        cellAlign(children, style?.textAlign),
      )}
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td className={cn('border-b px-2.5 py-1.5 align-top leading-snug', cellAlign(children, style?.textAlign))}>{children}</td>
  ),
  tr: ({ children }) => <tr className="[&:last-child>td]:border-b-0">{children}</tr>,
}

export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="min-w-0 text-sm leading-relaxed text-foreground break-words sm:text-[0.9375rem]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrlTransform} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
