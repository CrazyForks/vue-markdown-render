# React Quick Start

Get started with markstream-react in your React project.

## Basic Setup

### 1. Installation

First, install the package:

```bash
pnpm add markstream-react
```

### 2. Import Styles

In your main entry file (e.g., `main.tsx`, `index.tsx`, or `App.tsx`):

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'markstream-react/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### 3. Use the Component

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `# Hello React!

This is **markstream-react** - a streaming-friendly Markdown renderer for React.

## Features

- Code syntax highlighting
- Mermaid diagrams
- Math formulas
- And much more!

\`\`\`javascript
console.log('Hello from React!')
\`\`\`
`

  return (
    <div>
      <MarkdownRender content={markdown} />
    </div>
  )
}

export default App
```

## Using with TypeScript

markstream-react is built with TypeScript and includes full type definitions:

```tsx
import type { ParsedNode } from 'markstream-react'
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = '# Hello TypeScript!'

  return <MarkdownRender content={markdown} />
}
```

## Using with Next.js

### App Router (Next.js 13+)

```tsx
'use client'

import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'

export default function MarkdownPage() {
  const [mounted, setMounted] = useState(false)
  const markdown = `# Hello Next.js!

This works with Next.js App Router.
`

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div>Loading...</div>
  }

  return <MarkdownRender content={markdown} />
}
```

### Pages Router

```tsx
import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'
import 'markstream-react/index.css'

export default function MarkdownPage() {
  const [mounted, setMounted] = useState(false)
  const markdown = `# Hello Next.js Pages Router!`

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div>Loading...</div>
  }

  return <MarkdownRender content={markdown} />
}
```

### Using Dynamic Imports (Recommended)

```tsx
import dynamic from 'next/dynamic'
import 'markstream-react/index.css'

const MarkdownRender = dynamic(
  () => import('markstream-react').then(mod => mod.default),
  { ssr: false }
)

export default function MarkdownPage() {
  const markdown = `# Hello Next.js!`

  return <MarkdownRender content={markdown} />
}
```

## Enabling Optional Features

### Code Syntax Highlighting

Install dependencies:

```bash
pnpm add shiki stream-markdown
```

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `\`\`\`javascript
const hello = 'world'
console.log(hello)
\`\`\``

  return <MarkdownRender content={markdown} />
}
```

### Mermaid Diagrams

Install mermaid:

```bash
pnpm add mermaid
```

Import styles and enable the loader:

```tsx
import { enableMermaid } from 'markstream-react'
import { useEffect } from 'react'
import 'markstream-react/index.css'
import 'mermaid/dist/mermaid.css'

enableMermaid()

function App() {
  const markdown = `#### Mermaid Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Keep trying]
\`\`\``

  return <MarkdownRender content={markdown} />
}
```

### Math Formulas (KaTeX)

Install katex:

```bash
pnpm add katex
```

Import styles and enable the loader:

```tsx
import { enableKatex } from 'markstream-react'
import 'markstream-react/index.css'
import 'katex/dist/katex.min.css'

enableKatex()

function App() {
  const markdown = `#### Math Example

Inline math: $E = mc^2$

Block math:

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$`

  return <MarkdownRender content={markdown} />
}
```

## Custom Components

You can customize how specific nodes are rendered by passing custom component mappings:

```tsx
import MarkdownRender, { renderNode } from 'markstream-react'
import { createContext, useContext } from 'react'

// Create a context for custom components
const CustomComponentsContext = createContext<Record<string, any>>({})

// Custom heading component
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

This heading is rendered with a custom component.
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

## Streaming Content

markstream-react supports streaming markdown content, which is useful for AI-generated content:

```tsx
import MarkdownRender from 'markstream-react'
import { useState } from 'react'

function StreamingDemo() {
  const [markdown, setMarkdown] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const fullText = `# Streaming Demo

This content is being streamed **character by character**.

## Features

1. Progressive rendering
2. No layout shift
3. Smooth animations

\`\`\`javascript
const streaming = true
console.log('Streaming enabled:', streaming)
\`\`\`
`

  const startStreaming = () => {
    setIsStreaming(true)
    setMarkdown('')
    let i = 0

    const interval = setInterval(() => {
      if (i < fullText.length) {
        setMarkdown(prev => prev + fullText[i])
        i++
      }
      else {
        clearInterval(interval)
        setIsStreaming(false)
      }
    }, 20)

    return () => clearInterval(interval)
  }

  return (
    <div>
      <button onClick={startStreaming} disabled={isStreaming}>
        {isStreaming ? 'Streaming...' : 'Start Streaming'}
      </button>
      <MarkdownRender content={markdown} />
    </div>
  )
}
```

## Using with React Hooks

```tsx
import MarkdownRender from 'markstream-react'
import { useCallback, useEffect, useState } from 'react'

function MarkdownEditor() {
  const [content, setContent] = useState('# Edit me!')
  const [html, setHtml] = useState('')

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }, [])

  return (
    <div className="markdown-editor">
      <textarea
        value={content}
        onChange={handleChange}
        placeholder="Write your markdown here..."
        className="editor-input"
      />
      <div className="editor-preview">
        <MarkdownRender content={content} />
      </div>
    </div>
  )
}
```

## Virtualized Lists

For large markdown documents, you can use virtualization:

```tsx
import MarkdownRender from 'markstream-react'

function LongDocument() {
  // Your very long markdown content
  const markdown = `# Long Document`

  return (
    <MarkdownRender
      content={markdown}
      maxLiveNodes={200}
      liveNodeBuffer={10}
    />
  )
}
```

## Props Reference

### MarkdownRender Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | - | Markdown content to render |
| `nodes` | `ParsedNode[]` | - | Pre-parsed AST nodes |
| `customId` | `string` | `'default'` | Identifier for scoping |
| `maxLiveNodes` | `number` | `100` | Max nodes for virtualization |
| `liveNodeBuffer` | `number` | `5` | Buffer for overscan |
| `batchRendering` | `boolean` | `false` | Enable batched rendering |
| `deferNodesUntilVisible` | `boolean` | `true` | Defer heavy nodes |
| `renderCodeBlocksAsPre` | `boolean` | `false` | Use `<pre><code>` fallback |

## Styling

The default styles are scoped under `.markstream-react` class. You can override styles:

```css
/* Your global styles */
.markstream-react {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
}

.markstream-react h1 {
  font-size: 2.5rem;
  font-weight: 700;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 0.5rem;
}

.markstream-react code {
  background: #f3f4f6;
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
}
```

## Using with Tailwind CSS

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'
import './output.css' // Your Tailwind output

function App() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <MarkdownRender content="# Hello Tailwind!" />
    </div>
  )
}
```

## Next Steps

- Explore [React Components documentation](/guide/react-components) for all available components
- Check out [Examples](/guide/examples) for more usage examples
- See [API Reference](/guide/components) for detailed API documentation
