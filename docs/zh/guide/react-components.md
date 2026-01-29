# React 组件与 API

markstream-react 提供与 markstream-vue 相同强大的组件，但专为 React 构建。所有组件都支持 React 18+ 并包含完整的 TypeScript 支持。

## 主组件：MarkdownRender

在 React 中渲染 markdown 内容的主要组件。

### Props

| 属性 | 类型 | 默认值 | 描述 |
|------|------|---------|-------------|
| `content` | `string` | - | 要渲染的 Markdown 内容 |
| `nodes` | `ParsedNode[]` | - | 预解析的 AST 节点（`content` 的替代方案） |
| `customId` | `string` | `'default'` | 自定义组件作用域标识符 |
| `maxLiveNodes` | `number` | `100` | 虚拟化最大渲染节点数 |
| `liveNodeBuffer` | `number` | `5` | 虚拟化过扫描缓冲区 |
| `batchRendering` | `boolean` | `false` | 启用增量批处理渲染 |
| `deferNodesUntilVisible` | `boolean` | `true` | 延迟渲染重型节点直到可见 |
| `renderCodeBlocksAsPre` | `boolean` | `false` | 将代码块回退为 `<pre><code>` |

### 使用

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `# Hello React!

这是 markstream-react。`

  return (
    <MarkdownRender
      customId="docs"
      content={markdown}
      maxLiveNodes={150}
    />
  )
}
```

## 代码块组件

### MarkdownCodeBlockNode

使用 Shiki 的轻量级代码高亮。

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
    alert('代码已复制！')
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

功能丰富的 Monaco 驱动代码块。

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
    console.log('代码已复制：', code)
  }

  const handlePreviewCode = (artifact: any) => {
    console.log('预览代码：', artifact)
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

## 数学组件

### MathBlockNode

使用 KaTeX 渲染块级数学公式。

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

渲染行内数学公式。

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
        公式如下：
        {' '}
        <MathInlineNode node={inlineMathNode} />
      </p>
    </div>
  )
}
```

## Mermaid 图表

### MermaidBlockNode

渐进式 Mermaid 图表渲染。

```tsx
import { MermaidBlockNode } from 'markstream-react'

function MermaidDiagram() {
  const mermaidNode = {
    type: 'code_block',
    language: 'mermaid',
    code: `graph TD
    A[开始] --> B{能用吗？}
    B -->|是| C[太好了！]`,
    raw: ''
  }

  const handleExport = (ev: any) => {
    console.log('Mermaid SVG：', ev.svgString)
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

## 其他节点组件

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
      { type: 'text', content: '这是一个 ' },
      { type: 'strong', children: [{ type: 'text', content: '粗体' }] },
      { type: 'text', content: ' 单词。' }
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
          { type: 'paragraph', children: [{ type: 'text', content: '项目 1' }] }
        ]
      },
      {
        type: 'list_item',
        children: [
          { type: 'paragraph', children: [{ type: 'text', content: '项目 2' }] }
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
    title: '示例',
    children: [{ type: 'text', content: '点击我' }]
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
    alt: '示例图片',
    title: '示例'
  }

  const handleClick = () => {
    console.log('图片被点击！')
  }

  const handleLoad = () => {
    console.log('图片已加载！')
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

## 工具函数

### getMarkdown

获取配置好的 markdown-it 实例。

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

将 markdown 字符串解析为 AST 结构。

```tsx
import { getMarkdown, parseMarkdownToStructure } from 'markstream-react'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# 标题\n\n这里的内容...', md)

// 与 MarkdownRender 一起使用
// <MarkdownRender nodes={nodes} />
```

### enableKatex / enableMermaid

为 KaTeX 和 Mermaid 启用功能加载器。

```tsx
import { enableKatex, enableMermaid } from 'markstream-react'

// 启用 KaTeX worker
enableKatex()

// 启用 Mermaid worker
enableMermaid()
```

## 自定义组件 API

### Props 接口

所有自定义节点组件都接收这些 props：

```tsx
interface NodeComponentProps {
  node: ParsedNode // 解析后的节点数据
  indexKey: number | string // 节点的唯一键
  customId?: string // 作用域标识符
}
```

### 示例自定义组件

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

// 使用
function App() {
  const paragraphNode = {
    type: 'paragraph',
    children: [
      { type: 'text', content: '自定义段落内容' }
    ]
  }

  return <CustomParagraph node={paragraphNode} indexKey={0} customId="docs" />
}
```

## 基于上下文的自定义渲染

对于更复杂的自定义渲染场景，你可以使用 React Context：

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
  const markdown = `# 自定义标题

这使用了自定义标题组件。
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

## 流式传输支持

markstream-react 支持流式 markdown 内容：

```tsx
import MarkdownRender from 'markstream-react'
import { useState } from 'react'

function StreamingDemo() {
  const [content, setContent] = useState('')
  const fullContent = `# 流式传输演示

此内容正在**逐字符**流式传输。
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

## TypeScript 支持

markstream-react 包含完整的 TypeScript 类型定义：

```tsx
import type { MarkdownRenderProps, NodeComponentProps, ParsedNode } from 'markstream-react'
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = '# Hello TypeScript!'
  const nodes: ParsedNode[] = []

  return <MarkdownRender content={markdown} nodes={nodes} />
}
```

## Next.js 最佳实践

### 仅客户端渲染

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
    return <div>加载中...</div>
  }

  return <MarkdownRender content="# Hello Next.js!" />
}
```

### 动态导入模式

```tsx
import dynamic from 'next/dynamic'

const MarkdownRender = dynamic(
  () => import('markstream-react').then(mod => mod.default),
  {
    ssr: false,
    loading: () => <div>加载 markdown 中...</div>
  }
)

export default function MarkdownPage() {
  return <MarkdownRender content="# Hello!" />
}
```

## Hooks 集成

你可以轻松地与 React hooks 集成：

```tsx
import MarkdownRender from 'markstream-react'
import { useCallback, useMemo, useState } from 'react'

function MarkdownEditor() {
  const [content, setContent] = useState('# 编辑我！')
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

## 错误处理

```tsx
import MarkdownRender from 'markstream-react'

function SafeMarkdown({ content }: { content: string }) {
  const [error, setError] = React.useState<Error | null>(null)

  if (error) {
    return (
      <div>
        渲染 markdown 时出错：
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

## 下一步

- 查看 [React 快速开始](/zh/guide/react-quick-start) 获取设置示例
- 探索 [Vue 3 组件](/zh/guide/components) 获取更多组件示例（API 类似）
- 查看 [使用与 API](/zh/guide/usage) 获取高级模式
