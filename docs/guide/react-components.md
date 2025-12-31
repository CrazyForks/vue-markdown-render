# React Components & API

markstream-react provides the same powerful components as markstream-vue, but built for React. All components support React 18+ with full TypeScript support.

## Main Component: MarkdownRender

The primary component for rendering markdown content in React.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | - | Markdown content to render |
| `nodes` | `ParsedNode[]` | - | Pre-parsed AST nodes (alternative to `content`) |
| `customId` | `string` | `'default'` | Identifier for custom component scoping |
| `maxLiveNodes` | `number` | `100` | Max number of rendered nodes for virtualization |
| `liveNodeBuffer` | `number` | `5` | Buffer for overscan in virtualization |
| `batchRendering` | `boolean` | `false` | Enable incremental batched rendering |
| `deferNodesUntilVisible` | `boolean` | `true` | Defer heavy nodes until visible |
| `renderCodeBlocksAsPre` | `boolean` | `false` | Fall back to `<pre><code>` for code blocks |
| `onBeforeRender` | `() => void` | - | Callback before rendering starts |
| `onAfterRender` | `() => void` | - | Callback after rendering completes |

### Usage

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `# Hello React!

This is markstream-react.`

  const handleBeforeRender = () => {
    console.log('Rendering started')
  }

  const handleAfterRender = () => {
    console.log('Rendering completed')
  }

  return (
    <MarkdownRender
      customId="docs"
      content={markdown}
      maxLiveNodes={150}
      onBeforeRender={handleBeforeRender}
      onAfterRender={handleAfterRender}
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
        headerRight={<span className="lang-badge">{codeNode.language}</span>}
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

  const handleMonacoReady = (editor: any) => {
    console.log('Monaco editor ready:', editor)
  }

  return (
    <div className="markstream-react">
      <CodeBlockNode
        node={codeNode}
        monacoOptions={{ fontSize: 14, theme: 'vs-dark' }}
        stream={true}
        onReady={handleMonacoReady}
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
      <MathBlockNode
        node={mathNode}
        displayMode={true}
        macros={{ '\\RR': '\\mathbb{R}' }}
        throwOnError={false}
      />
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
    type: 'mermaid_block',
    content: `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]`,
    raw: ''
  }

  const handleMermaidRender = (svg: string) => {
    console.log('Mermaid diagram rendered:', svg)
  }

  return (
    <div className="markstream-react">
      <MermaidBlockNode
        node={mermaidNode}
        theme="forest"
        isStrict={true}
        onRender={handleMermaidRender}
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
    level: 1,
    children: [{ type: 'text', content: 'Hello World' }]
  }

  return <HeadingNode node={headingNode} />
}
```

### ParagraphNode

```tsx
import { ParagraphNode } from 'markstream-react'

function CustomParagraph() {
  const paragraphNode = {
    type: 'paragraph',
    children: [
      { type: 'text', content: 'This is a ' },
      { type: 'strong', children: [{ type: 'text', content: 'bold' }] },
      { type: 'text', content: ' word.' }
    ]
  }

  return <ParagraphNode node={paragraphNode} />
}
```

### ListNode

```tsx
import { ListNode } from 'markstream-react'

function CustomList() {
  const listNode = {
    type: 'list',
    ordered: false,
    children: [
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

  return <ListNode node={listNode} />
}
```

### LinkNode

```tsx
import { LinkNode } from 'markstream-react'

function CustomLink() {
  const linkNode = {
    type: 'link',
    url: 'https://example.com',
    title: 'Example',
    children: [{ type: 'text', content: 'Click me' }]
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
    title: 'Example'
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
import { getMarkdown } from 'markstream-react'

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
import { getMarkdown, parseMarkdownToStructure } from 'markstream-react'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# Title\n\nContent here...', md)

// Use with MarkdownRender
// <MarkdownRender nodes={nodes} />
```

### enableKatex / enableMermaid

Enable feature loaders for KaTeX and Mermaid.

```tsx
import { enableKatex, enableMermaid } from 'markstream-react'

// Enable KaTeX worker
enableKatex()

// Enable Mermaid worker
enableMermaid()
```

## Custom Component API

### Props Interface

All custom node components receive these props:

```tsx
interface NodeComponentProps {
  node: ParsedNode // The parsed node data
  indexKey: number | string // Unique key for the node
  customId?: string // Custom ID for scoping
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

## Context-Based Custom Rendering

For more complex custom rendering scenarios, you can use React Context:

```tsx
import MarkdownRender from 'markstream-react'
import React, { createContext, useContext } from 'react'

interface CustomComponentsContextType {
  [key: string]: React.ComponentType<any>
}

const CustomComponentsContext = createContext<CustomComponentsContextType>({})

function CustomHeading({ node, indexKey, customId }: any) {
  const level = node.level || 1
  const Tag = `h${level}` as keyof JSX.IntrinsicElements

  return (
    <Tag className="custom-heading" data-custom-id={customId}>
      {node.children?.map((child: any, i: number) => (
        <span key={i}>{child.content || ''}</span>
      ))}
    </Tag>
  )
}

function App() {
  const markdown = `# Custom Heading

This uses a custom heading component.
`

  const customComponents = {
    heading: CustomHeading
  }

  return (
    <CustomComponentsContext.Provider value={customComponents}>
      <MarkdownRender content={markdown} />
    </CustomComponentsContext.Provider>
  )
}
```

## Streaming Support

markstream-react supports streaming markdown content:

```tsx
import MarkdownRender from 'markstream-react'
import { useState } from 'react'

function StreamingDemo() {
  const [content, setContent] = useState('')
  const fullContent = `# Streaming Demo

This content streams in **character by character**.
`

  React.useEffect(() => {
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
import type { MarkdownRenderProps, NodeComponentProps, ParsedNode } from 'markstream-react'
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = '# Hello TypeScript!'
  const nodes: ParsedNode[] = []

  return <MarkdownRender content={markdown} nodes={nodes} />
}
```

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
import MarkdownRender from 'markstream-react'
import { useCallback, useMemo, useState } from 'react'

function MarkdownEditor() {
  const [content, setContent] = useState('# Edit me!')
  const [theme, setTheme] = useState('light')

  const memoizedContent = useMemo(() => content, [content])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

function SafeMarkdown({ content }: { content: string }) {
  const [error, setError] = React.useState<Error | null>(null)

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
