# React Components & API

markstream-react provides the same powerful components as markstream-vue, but built for React. All components support React 18+ with full TypeScript support.

## Main Component: MarkdownRender

The primary component for rendering markdown content in React.

### Props

`MarkdownRender` uses the `NodeRendererProps` interface from `markstream-react`.

#### Core props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | - | Markdown content to render |
| `nodes` | `BaseNode[]` | - | Pre-parsed AST nodes (typically `ParsedNode[]` from the parser) |
| `customId` | `string` | - | Identifier for scoping custom components and CSS |
| `final` | `boolean` | `false` | Marks end-of-stream; stops emitting streaming `loading` nodes |
| `parseOptions` | `ParseOptions` | - | Parser options and token hooks (only when `content` is provided) |
| `customHtmlTags` | `readonly string[]` | - | HTML-like tags emitted as custom nodes (e.g. `thinking`) |
| `customMarkdownIt` | `(md: MarkdownIt) => MarkdownIt` | - | Customize the internal MarkdownIt instance |
| `debugPerformance` | `boolean` | `false` | Log parse/render timing and virtualization stats (dev only) |
| `isDark` | `boolean` | `false` | Theme flag forwarded to heavy nodes; adds `.dark` to the root container |
| `indexKey` | `number \| string` | - | Key prefix when rendering multiple instances in lists |
| `typewriter` | `boolean` | `true` | Enable the non-code-node enter transition |

#### Streaming & heavy-node toggles

| Prop | Default | Description |
|------|---------|-------------|
| `renderCodeBlocksAsPre` | `false` | Render code blocks as `<pre><code>` (Mermaid/D2/Infographic blocks will also fall back) |
| `codeBlockStream` | `true` | Stream code block updates as content arrives |
| `viewportPriority` | `true` | Defer heavy work (Monaco/Mermaid/D2/KaTeX) until near viewport |
| `deferNodesUntilVisible` | `true` | Render heavy nodes as placeholders until visible (non-virtualized mode only) |

#### Performance (virtualization & batching)

| Prop | Default | Description |
|------|---------|-------------|
| `maxLiveNodes` | `320` | Max fully rendered nodes kept in DOM (set `0` to disable virtualization) |
| `liveNodeBuffer` | `60` | Overscan buffer around the focus range |
| `batchRendering` | `true` | Incremental batch rendering when virtualization is disabled |
| `initialRenderBatchSize` | `40` | Nodes rendered immediately before batching starts |
| `renderBatchSize` | `80` | Nodes rendered per batch tick |
| `renderBatchDelay` | `16` | Extra delay (ms) before each batch after rAF |
| `renderBatchBudgetMs` | `6` | Time budget (ms) before adaptive batch sizes shrink |
| `renderBatchIdleTimeoutMs` | `120` | Timeout (ms) for `requestIdleCallback` slices |

#### Global code block options

| Prop | Type | Description |
|------|------|-------------|
| `codeBlockDarkTheme` | `any` | Monaco dark theme object forwarded to every `CodeBlockNode` |
| `codeBlockLightTheme` | `any` | Monaco light theme object forwarded to every `CodeBlockNode` |
| `codeBlockMonacoOptions` | `Record<string, any>` | Options forwarded to `stream-monaco` |
| `codeBlockMinWidth` | `string \| number` | Min width forwarded to `CodeBlockNode` |
| `codeBlockMaxWidth` | `string \| number` | Max width forwarded to `CodeBlockNode` |
| `codeBlockProps` | `Record<string, any>` | Extra props forwarded to every `CodeBlockNode` |
| `themes` | `string[]` | Theme list forwarded to `stream-monaco` |

#### Events

| Prop | Type | Description |
|------|------|-------------|
| `onCopy` | `(code: string) => void` | Fired when code blocks emit copy events |
| `onHandleArtifactClick` | `(payload: any) => void` | Fired on artifact/preview clicks |
| `onClick` | `(event: React.MouseEvent<HTMLDivElement>) => void` | Click handler for the renderer root |
| `onMouseOver` | `(event: React.MouseEvent<HTMLElement>) => void` | Mouseover handler for the renderer root |
| `onMouseOut` | `(event: React.MouseEvent<HTMLElement>) => void` | Mouseout handler for the renderer root |

### Usage

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `# Hello React!

This is markstream-react.`

  return (
    <MarkdownRender
      customId="docs"
      content={markdown}
      maxLiveNodes={150}
    />
  )
}
```

## Code Block Components

### MarkdownCodeBlockNode

Lightweight code highlighting using Shiki.

```tsx
import { MarkdownCodeBlockNode } from 'markstream-react'

function CodeBlock() {
  const codeNode = {
    type: 'code_block',
    language: 'javascript',
    code: 'const hello = "world"',
    raw: 'const hello = "world"'
  }

  const handleCopy = () => {
    alert('Code copied!')
  }

  return (
    <div className="markstream-react">
      <MarkdownCodeBlockNode
        node={codeNode}
        showCopyButton={true}
        onCopy={handleCopy}
      />
    </div>
  )
}
```

### CodeBlockNode

Feature-rich Monaco-powered code blocks.

```tsx
import { CodeBlockNode } from 'markstream-react'

function MonacoCodeBlock() {
  const codeNode = {
    type: 'code_block',
    language: 'typescript',
    code: 'const greeting: string = "Hello"',
    raw: 'const greeting: string = "Hello"'
  }

  const handleCopy = (code: string) => {
    console.log('Code copied:', code)
  }

  const handlePreviewCode = (artifact: any) => {
    console.log('Preview code:', artifact)
  }

  return (
    <div className="markstream-react">
      <CodeBlockNode
        node={codeNode}
        monacoOptions={{ fontSize: 14, theme: 'vs-dark' }}
        stream={true}
        onCopy={handleCopy}
        onPreviewCode={handlePreviewCode}
      />
    </div>
  )
}
```

## Math Components

### MathBlockNode

Renders block-level math formulas with KaTeX.

```tsx
import { MathBlockNode } from 'markstream-react'

function MathBlock() {
  const mathNode = {
    type: 'math_block',
    content: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
    raw: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}'
  }

  return (
    <div className="markstream-react">
      <MathBlockNode node={mathNode} />
    </div>
  )
}
```

### MathInlineNode

Renders inline math formulas.

```tsx
import { MathInlineNode } from 'markstream-react'

function MathInline() {
  const inlineMathNode = {
    type: 'math_inline',
    content: 'E = mc^2',
    raw: 'E = mc^2'
  }

  return (
    <div className="markstream-react">
      <p>
        The formula is:
        {' '}
        <MathInlineNode node={inlineMathNode} />
      </p>
    </div>
  )
}
```

## Mermaid Diagrams

### MermaidBlockNode

Progressive Mermaid diagram rendering.

```tsx
import { MermaidBlockNode } from 'markstream-react'

function MermaidDiagram() {
  const mermaidNode = {
    type: 'code_block',
    language: 'mermaid',
    code: `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]`,
    raw: ''
  }

  const handleExport = (ev: any) => {
    console.log('Mermaid SVG:', ev.svgString)
  }

  return (
    <div className="markstream-react">
      <MermaidBlockNode
        node={mermaidNode}
        isStrict={true}
        onExport={handleExport}
      />
    </div>
  )
}
```

Event notes:
- `onCopy(code: string)` receives the source text directly (no `MermaidBlockEvent` wrapper in React).
- `onExport`, `onOpenModal`, `onToggleMode` receive `MermaidBlockEvent` and support `ev.preventDefault()` to stop the default behavior.
- `onToggleMode` signature: `(target: 'source' | 'preview', ev)`.

## D2 Diagrams

### D2BlockNode

Progressive D2 diagram rendering with source fallback.

```tsx
import { D2BlockNode } from 'markstream-react'

function D2Diagram() {
  const d2Node = {
    type: 'code_block',
    language: 'd2',
    code: `direction: right
Client -> API: request
API -> DB: query`,
    raw: ''
  }

  return (
    <div className="markstream-react">
      <D2BlockNode
        node={d2Node}
        progressiveIntervalMs={600}
      />
    </div>
  )
}
```

## Other Node Components

### HeadingNode

```tsx
import { HeadingNode } from 'markstream-react'

function CustomHeading() {
  const headingNode = {
    type: 'heading',
    level: 1
  }

  return <HeadingNode node={headingNode}>Hello World</HeadingNode>
}
```

### ParagraphNode

```tsx
import { ParagraphNode } from 'markstream-react'

function CustomParagraph() {
  const paragraphNode = {
    type: 'paragraph'
  }

  return (
    <ParagraphNode node={paragraphNode}>
      This is a
      {' '}
      <strong>bold</strong>
      {' '}
      word.
    </ParagraphNode>
  )
}
```

### ListNode

```tsx
import { ListNode, renderNode } from 'markstream-react'

function CustomList() {
  const listNode = {
    type: 'list',
    ordered: false,
    items: [
      {
        type: 'list_item',
        children: [
          { type: 'paragraph', children: [{ type: 'text', content: 'Item 1' }] }
        ]
      },
      {
        type: 'list_item',
        children: [
          { type: 'paragraph', children: [{ type: 'text', content: 'Item 2' }] }
        ]
      }
    ]
  }

  const ctx = { events: {} }

  return <ListNode node={listNode} ctx={ctx} renderNode={renderNode} />
}
```

### LinkNode

```tsx
import { LinkNode } from 'markstream-react'

function CustomLink() {
  const linkNode = {
    type: 'link',
    href: 'https://example.com',
    title: 'Example',
    text: 'Click me'
  }

  return (
    <LinkNode
      node={linkNode}
      color="#e11d48"
      underlineHeight={3}
      showTooltip={true}
    />
  )
}
```

### ImageNode

```tsx
import { ImageNode } from 'markstream-react'

function CustomImage() {
  const imageNode = {
    type: 'image',
    src: 'https://example.com/image.jpg',
    alt: 'Example image',
    title: 'Example',
    raw: '![Example image](https://example.com/image.jpg)'
  }

  const handleClick = () => {
    console.log('Image clicked!')
  }

  const handleLoad = () => {
    console.log('Image loaded!')
  }

  return (
    <ImageNode
      node={imageNode}
      onClick={handleClick}
      onLoad={handleLoad}
    />
  )
}
```

## Utility Functions

### getMarkdown

Get a configured markdown-it instance.

```tsx
import { getMarkdown } from 'stream-markdown-parser'

const md = getMarkdown('my-msg-id', {
  html: true,
  linkify: true,
  typographer: true
})

const tokens = md.parse('# Hello World')
```

### parseMarkdownToStructure

Parse markdown string to AST structure.

```tsx
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# Title\n\nContent here...', md)

// Use with MarkdownRender
// <MarkdownRender nodes={nodes} />
```

### Optional workers (Mermaid / KaTeX)

Mermaid/KaTeX auto-load when installed. If you want off‑thread parsing/rendering, inject workers:

```tsx
import { setKaTeXWorker, setMermaidWorker } from 'markstream-react'
import KatexWorker from 'markstream-react/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-react/workers/mermaidParser.worker?worker'

setMermaidWorker(new MermaidWorker())
setKaTeXWorker(new KatexWorker())
```

## Custom Component API

### Props Interface

All custom node components receive these props:

```tsx
interface NodeComponentProps<TNode = unknown> {
  node: TNode // The parsed node data
  ctx?: RenderContext // Renderer context (themes, events, flags)
  renderNode?: RenderNodeFn // Helper to render child nodes
  indexKey?: React.Key // Unique key for the node
  customId?: string // Custom ID for scoping
  isDark?: boolean
  typewriter?: boolean
  children?: React.ReactNode
}
```

### Example Custom Component

```tsx
import React from 'react'

interface CustomParagraphProps {
  node: {
    type: string
    children: Array<{
      type: string
      content?: string
      children?: any[]
    }>
  }
  indexKey?: number | string
  customId?: string
}

function CustomParagraph({ node, indexKey, customId }: CustomParagraphProps) {
  return (
    <p
      className={`custom-paragraph custom-paragraph-${indexKey}`}
      data-custom-id={customId}
      data-node-type={node.type}
    >
      {node.children.map((child, i) => (
        <span key={i}>{child.content || ''}</span>
      ))}
    </p>
  )
}

// Usage
function App() {
  const paragraphNode = {
    type: 'paragraph',
    children: [
      { type: 'text', content: 'Custom paragraph content' }
    ]
  }

  return <CustomParagraph node={paragraphNode} indexKey={0} customId="docs" />
}
```

## Context + Custom Components

You can use React Context inside custom node components, while still registering them via `setCustomComponents`:

```tsx
import MarkdownRender, { setCustomComponents } from 'markstream-react'
import React, { createContext, useContext } from 'react'

const ThemeContext = createContext<'light' | 'dark'>('light')

function CustomHeading({ node, customId }: any) {
  const theme = useContext(ThemeContext)
  const level = node.level || 1
  const Tag = `h${level}` as keyof JSX.IntrinsicElements

  return (
    <Tag className={`custom-heading ${theme}`} data-custom-id={customId}>
      {node.children?.map((child: any, i: number) => (
        <span key={i}>{child.content || ''}</span>
      ))}
    </Tag>
  )
}

setCustomComponents('docs', { heading: CustomHeading })

function App() {
  const markdown = `# Custom Heading

This uses a custom heading component.
`

  return (
    <ThemeContext.Provider value="dark">
      <MarkdownRender customId="docs" content={markdown} />
    </ThemeContext.Provider>
  )
}
```

## Streaming Support

markstream-react supports streaming markdown content:

```tsx
import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'

function StreamingDemo() {
  const [content, setContent] = useState('')
  const fullContent = `# Streaming Demo

This content streams in **small chunks**.
`

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i < fullContent.length) {
        setContent(prev => prev + fullContent[i])
        i++
      }
      else {
        clearInterval(interval)
      }
    }, 30)

    return () => clearInterval(interval)
  }, [])

  return <MarkdownRender content={content} />
}
```

## TypeScript Support

markstream-react includes full TypeScript definitions:

```tsx
import type { NodeComponentProps, NodeRendererProps } from 'markstream-react'
import type { ParsedNode } from 'stream-markdown-parser'
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = '# Hello TypeScript!'
  const nodes: ParsedNode[] = []

  return <MarkdownRender content={markdown} nodes={nodes} />
}
```

Code block prop interfaces (`CodeBlockNodeProps`, `MermaidBlockNodeProps`, `D2BlockNodeProps`, `InfographicBlockNodeProps`, `PreCodeNodeProps`) all use `node: CodeBlockNode` from `stream-markdown-parser` (use `language: 'mermaid'` / `language: 'd2'` / `language: 'd2lang'` / `language: 'infographic'` when targeting specialized renderers).

## Next.js Best Practices

### Client-Side Only Rendering

```tsx
'use client'

import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'

export default function MarkdownPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div>Loading...</div>
  }

  return <MarkdownRender content="# Hello Next.js!" />
}
```

### Dynamic Import Pattern

```tsx
import dynamic from 'next/dynamic'

const MarkdownRender = dynamic(
  () => import('markstream-react').then(mod => mod.default),
  {
    ssr: false,
    loading: () => <div>Loading markdown...</div>
  }
)

export default function MarkdownPage() {
  return <MarkdownRender content="# Hello!" />
}
```

## Hooks Integration

You can easily integrate with React hooks:

```tsx
import type { ChangeEvent } from 'react'
import MarkdownRender from 'markstream-react'
import { useCallback, useMemo, useState } from 'react'

function MarkdownEditor() {
  const [content, setContent] = useState('# Edit me!')
  const [theme, setTheme] = useState('light')

  const memoizedContent = useMemo(() => content, [content])

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }, [])

  return (
    <div>
      <textarea value={content} onChange={handleChange} />
      <MarkdownRender
        content={memoizedContent}
        customId={`editor-${theme}`}
      />
    </div>
  )
}
```

## Error Handling

```tsx
import MarkdownRender from 'markstream-react'
import { useState } from 'react'

function SafeMarkdown({ content }: { content: string }) {
  const [error, setError] = useState<Error | null>(null)

  if (error) {
    return (
      <div>
        Error rendering markdown:
        {error.message}
      </div>
    )
  }

  try {
    return <MarkdownRender content={content} />
  }
  catch (err) {
    setError(err as Error)
    return null
  }
}
```

## Next Steps

- See [React Quick Start](/guide/react-quick-start) for setup examples
- Explore [Vue 3 Components](/guide/components) for more component examples (API is similar)
- Check [Usage & API](/guide/usage) for advanced patterns
