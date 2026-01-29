# React 快速开始

在你的 React 项目中开始使用 markstream-react。

## 基础设置

### 1. 安装

首先，安装包：

```bash
pnpm add markstream-react
```

### 2. 导入样式

在你的主入口文件（如 `main.tsx`、`index.tsx` 或 `App.tsx`）中：

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

### 3. 使用组件

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `# Hello React!

这是 **markstream-react** - 适用于 React 的流式 Markdown 渲染器。

## 功能

- 代码语法高亮
- Mermaid 图表
- 数学公式
- 还有更多功能！

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

## 使用 TypeScript

markstream-react 使用 TypeScript 构建，包含完整的类型定义：

```tsx
import type { ParsedNode } from 'markstream-react'
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = '# Hello TypeScript!'

  return (
    <MarkdownRender content={markdown} />
  )
}
```

## 使用 Next.js

### App Router（Next.js 13+）

```tsx
'use client'

import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'

export default function MarkdownPage() {
  const [mounted, setMounted] = useState(false)
  const markdown = `# Hello Next.js!

这适用于 Next.js App Router。
`

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div>加载中...</div>
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
    return <div>加载中...</div>
  }

  return <MarkdownRender content={markdown} />
}
```

### 使用动态导入（推荐）

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

## 启用可选功能

### 代码语法高亮

安装依赖：

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

### Mermaid 图表

安装 mermaid：

```bash
pnpm add mermaid
```

导入样式并启用加载器：

```tsx
import { enableMermaid } from 'markstream-react'
import { useEffect } from 'react'
import 'markstream-react/index.css'

enableMermaid()

function App() {
  const markdown = `#### Mermaid 图表

\`\`\`mermaid
graph TD
    A[开始] --> B{能用吗？}
    B -->|是| C[太好了！]
    B -->|否| D[继续尝试]
\`\`\``

  return <MarkdownRender content={markdown} />
}
```

### 数学公式（KaTeX）

安装 katex：

```bash
pnpm add katex
```

导入样式并启用加载器：

```tsx
import { enableKatex } from 'markstream-react'
import 'markstream-react/index.css'
import 'katex/dist/katex.min.css'

enableKatex()

function App() {
  const markdown = `#### 数学示例

行内数学公式：$E = mc^2$

块级数学公式：

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$`

  return <MarkdownRender content={markdown} />
}
```

## 自定义组件

你可以通过传递自定义组件映射来自定义特定节点的渲染方式：

```tsx
import MarkdownRender, { renderNode } from 'markstream-react'
import { createContext, useContext } from 'react'

// 创建自定义组件的上下文
const CustomComponentsContext = createContext<Record<string, any>>({})

// 自定义标题组件
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
  const markdown = `# 自定义标题

此标题使用自定义组件渲染。
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

## 流式内容

markstream-react 支持流式 markdown 内容，适用于 AI 生成的内容：

```tsx
import MarkdownRender from 'markstream-react'
import { useState } from 'react'

function StreamingDemo() {
  const [markdown, setMarkdown] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const fullText = `# 流式传输演示

此内容正在**逐字符**流式传输。

## 功能

1. 渐进式渲染
2. 无布局偏移
3. 流畅动画

\`\`\`javascript
const streaming = true
console.log('流式传输已启用:', streaming)
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
        {isStreaming ? '传输中...' : '开始流式传输'}
      </button>
      <MarkdownRender content={markdown} />
    </div>
  )
}
```

## 使用 React Hooks

```tsx
import MarkdownRender from 'markstream-react'
import { useCallback, useEffect, useState } from 'react'

function MarkdownEditor() {
  const [content, setContent] = useState('# 编辑我！')
  const [html, setHtml] = useState('')

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }, [])

  return (
    <div className="markdown-editor">
      <textarea
        value={content}
        onChange={handleChange}
        placeholder="在这里输入 markdown..."
        className="editor-input"
      />
      <div className="editor-preview">
        <MarkdownRender content={content} />
      </div>
    </div>
  )
}
```

## 虚拟化列表

对于大型 markdown 文档，可以使用虚拟化：

```tsx
import MarkdownRender from 'markstream-react'

function LongDocument() {
  // 你的很长的 markdown 内容
  const markdown = `# 长文档`

  return (
    <MarkdownRender
      content={markdown}
      maxLiveNodes={200}
      liveNodeBuffer={10}
    />
  )
}
```

## Props 参考

### MarkdownRender Props

| 属性 | 类型 | 默认值 | 描述 |
|------|------|---------|-------------|
| `content` | `string` | - | 要渲染的 Markdown 内容 |
| `nodes` | `ParsedNode[]` | - | 预解析的 AST 节点 |
| `customId` | `string` | `'default'` | 作用域标识符 |
| `maxLiveNodes` | `number` | `100` | 虚拟化最大节点数 |
| `liveNodeBuffer` | `number` | `5` | 过扫描缓冲区 |
| `batchRendering` | `boolean` | `false` | 启用批处理渲染 |
| `deferNodesUntilVisible` | `boolean` | `true` | 延迟重型节点 |
| `renderCodeBlocksAsPre` | `boolean` | `false` | 使用 `<pre><code>` 回退 |

## 样式

默认样式限定在 `.markstream-react` 类下。你可以覆盖样式：

```css
/* 你的全局样式 */
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

## 使用 Tailwind CSS

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'
import './output.css' // 你的 Tailwind 输出

function App() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <MarkdownRender content="# Hello Tailwind!" />
    </div>
  )
}
```

## 下一步

- 探索 [React 组件文档](/zh/guide/react-components) 了解所有可用组件
- 查看 [示例](/zh/guide/examples) 获取更多使用示例
- 查看 [API 参考](/zh/guide/components) 获取详细 API 文档
