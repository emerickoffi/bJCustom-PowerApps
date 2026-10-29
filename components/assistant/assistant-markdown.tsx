'use client'

import Link from 'next/link'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeUrlTransform } from '@/lib/ai/assistant-markdown-url'

// Raw HTML is never rendered: skipHtml is set and no rehype-raw plugin is used.

const components: Components = {
  h1: ({ children }) => <h3 className="mt-3 text-base font-semibold text-foreground first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 text-base font-semibold text-foreground first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-2 text-sm font-semibold text-foreground first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="text-pretty leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 first:mt-0 [&_ul]:mt-1">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 first:mt-0 [&_ol]:mt-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed marker:text-muted-foreground">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-3 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>
    if (href.startsWith('/')) {
      return (
        <Link href={href} className="font-medium text-primary underline underline-offset-2">
          {children}
        </Link>
      )
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary underline underline-offset-2">
        {children}
      </a>
    )
  },
  code: ({ className, children }) => {
    const isBlock = typeof className === 'string' && className.startsWith('language-')
    if (isBlock) return <code className={className}>{children}</code>
    return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8125rem]">{children}</code>
  },
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed first:mt-0">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="mt-2 w-full overflow-x-auto rounded-lg border first:mt-0">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => <th className="whitespace-nowrap border-b px-2.5 py-1.5 font-semibold text-foreground">{children}</th>,
  td: ({ children }) => <td className="border-b px-2.5 py-1.5 align-top last:border-b-0">{children}</td>,
  tr: ({ children }) => <tr className="[&:last-child>td]:border-b-0">{children}</tr>,
}

export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="min-w-0 break-words text-sm text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrlTransform} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
