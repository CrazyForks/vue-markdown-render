# React Installation

Install markstream-react with pnpm, npm or yarn.

```bash
pnpm add markstream-react
# or
npm install markstream-react
# or
yarn add markstream-react
```

## Requirements

markstream-react requires:
- **React 18+** and **ReactDOM 18+**
- **stream-markdown-parser** (auto-installed as dependency)

## Optional Peer Dependencies

markstream-react supports various features through optional peer dependencies. Install only what you need:

| Feature | Required Packages | Install Command |
|---------|------------------|-----------------|
| Code Syntax Highlighting | `shiki`, `stream-markdown` | `pnpm add shiki stream-markdown` |
| Monaco Editor (full code block features) | `stream-monaco` | `pnpm add stream-monaco` |
| Mermaid Diagrams | `mermaid` | `pnpm add mermaid` |
| Math Rendering (KaTeX) | `katex` | `pnpm add katex` |

## Enable feature loaders (Mermaid / KaTeX)

After installing optional peers, opt-in loaders in your client entry:

```tsx
import { enableKatex, enableMermaid } from 'markstream-react'

enableMermaid()
enableKatex()
```

Also remember required CSS:

```tsx
import 'markstream-react/index.css'
import 'katex/dist/katex.min.css'
import 'mermaid/dist/mermaid.css'
```

Monaco (`stream-monaco`) does not require a separate CSS import.

Note: `markstream-react/index.css` is scoped under an internal `.markstream-react` container to reduce global style conflicts. `MarkdownRender` renders inside that container by default. If you render node components standalone, wrap them with `<div className="markstream-react">...</div>`.

### Quick Install: All Features

To enable all features at once:

```bash
pnpm add shiki stream-markdown stream-monaco mermaid katex
# or
npm install shiki stream-markdown stream-monaco mermaid katex
```

### Feature Details

#### Code Syntax Highlighting

Requires both `shiki` and `stream-markdown`:

```bash
pnpm add shiki stream-markdown
```

This enables syntax highlighting in code blocks using Shiki.

#### Monaco Editor

For full code block functionality (copy button, font size controls, expand/collapse):

```bash
pnpm add stream-monaco
```

Without `stream-monaco`, code blocks will render but interactive buttons may not work.

#### Mermaid Diagrams

For rendering Mermaid diagrams:

```bash
pnpm add mermaid
```

#### KaTeX Math Rendering

For math formula rendering:

```bash
pnpm add katex
```

Also import the KaTeX CSS in your app entry:

```tsx
import 'katex/dist/katex.min.css'
```

## Quick Test

Import and render a simple markdown string:

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

function App() {
  const md = '# Hello from markstream-react!'

  return <MarkdownRender content={md} />
}

export default App
```

## TypeScript Support

markstream-react is written in TypeScript and includes full type definitions out of the box. No additional configuration is needed:

```tsx
import type { MarkdownRenderProps, ParsedNode } from 'markstream-react'
import MarkdownRender from 'markstream-react'
```

## Next.js Integration

For Next.js projects, you need to ensure components only render on the client side when using browser-only features:

```tsx
'use client'

import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'
import 'markstream-react/index.css'

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

Or use the `'use client'` directive with dynamic imports:

```tsx
import dynamic from 'next/dynamic'

const MarkdownRender = dynamic(
  () => import('markstream-react').then(mod => mod.default),
  { ssr: false }
)

export default function MarkdownPage() {
  return <MarkdownRender content="# Hello Next.js!" />
}
```

## Vite Integration

For Vite projects, simply import the component and styles:

```tsx
// src/main.tsx
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

```tsx
// src/App.tsx
import MarkdownRender from 'markstream-react'

function App() {
  const content = `# Hello Vite!

This is markstream-react working with **Vite**.`

  return <MarkdownRender content={content} />
}

export default App
```

## Webpack Integration

For projects using Webpack, ensure your configuration handles CSS imports:

```js
module.exports = {
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
}
```

## Custom Components Setup

To use custom node components, you'll need to create a custom renderer. See the [Components documentation](/guide/react-components) for details.
