# React 组件与 API

markstream-react 提供与 markstream-vue 相同强大的组件，但专为 React 构建。所有组件都支持 React 18+ 并包含完整的 TypeScript 支持。

## 主组件：MarkdownRender

在 React 中渲染 markdown 内容的主要组件。

### Props

`MarkdownRender` 使用 `markstream-react` 的 `NodeRendererProps`。

#### 核心 props

| 属性 | 类型 | 默认值 | 描述 |
|------|------|---------|-------------|
| `content` | `string` | - | 要渲染的 Markdown 内容 |
| `nodes` | `BaseNode[]` | - | 预解析的 AST 节点（通常为 `ParsedNode[]`） |
| `customId` | `string` | - | 作用域标识，用于 `setCustomComponents` 与样式隔离 |
| `final` | `boolean` | `false` | 标记输入结束，停止输出 streaming `loading` 节点 |
| `parseOptions` | `ParseOptions` | - | 解析选项与 token hooks（仅在传入 `content` 时生效） |
| `customHtmlTags` | `readonly string[]` | - | 作为自定义节点输出的 HTML-like 标签（如 `thinking`） |
| `customMarkdownIt` | `(md: MarkdownIt) => MarkdownIt` | - | 自定义 MarkdownIt 实例 |
| `debugPerformance` | `boolean` | `false` | 输出解析/渲染耗时与虚拟化统计（仅 dev） |
| `isDark` | `boolean` | `false` | 暗色主题标记，转发给重型节点并在根容器加 `.dark` |
| `indexKey` | `number \| string` | - | 列表渲染时的 key 前缀 |
| `typewriter` | `boolean` | `true` | 非代码节点进入动画 |

#### 流式与重节点开关

| 属性 | 默认值 | 描述 |
|------|---------|-------------|
| `renderCodeBlocksAsPre` | `false` | 将非 Mermaid/Infographic 的 `code_block` 渲染为 `<pre><code>` |
| `codeBlockStream` | `true` | 随内容到达流式更新代码块 |
| `viewportPriority` | `true` | 将 Monaco/Mermaid/KaTeX 等重型工作延迟到接近视口时 |
| `deferNodesUntilVisible` | `true` | 重型节点先占位，接近可视区再渲染（仅非虚拟化模式） |

#### 性能（虚拟化与批次渲染）

| 属性 | 默认值 | 描述 |
|------|---------|-------------|
| `maxLiveNodes` | `320` | DOM 最大保留节点数（设为 `0` 关闭虚拟化） |
| `liveNodeBuffer` | `60` | 视窗前后 overscan 缓冲 |
| `batchRendering` | `true` | 在关闭虚拟化时启用批次渲染 |
| `initialRenderBatchSize` | `40` | 批次渲染前先渲染的节点数量 |
| `renderBatchSize` | `80` | 每个批次渲染的节点数量 |
| `renderBatchDelay` | `16` | 每次批次前的额外延迟（ms） |
| `renderBatchBudgetMs` | `6` | 自适应批次缩小前的预算（ms） |
| `renderBatchIdleTimeoutMs` | `120` | `requestIdleCallback` 超时（ms） |

#### 代码块全局配置

| 属性 | 类型 | 描述 |
|------|------|-------------|
| `codeBlockDarkTheme` | `any` | 转发到每个 `CodeBlockNode` 的 Monaco 深色主题 |
| `codeBlockLightTheme` | `any` | 转发到每个 `CodeBlockNode` 的 Monaco 浅色主题 |
| `codeBlockMonacoOptions` | `Record<string, any>` | 转发到 `stream-monaco` 的选项 |
| `codeBlockMinWidth` | `string \| number` | 转发到 `CodeBlockNode` 的最小宽度 |
| `codeBlockMaxWidth` | `string \| number` | 转发到 `CodeBlockNode` 的最大宽度 |
| `codeBlockProps` | `Record<string, any>` | 额外转发到每个 `CodeBlockNode` 的 props |
| `themes` | `string[]` | 转发到 `stream-monaco` 的主题列表 |

#### 事件

| 属性 | 类型 | 描述 |
|------|------|-------------|
| `onCopy` | `(code: string) => void` | 代码块复制事件 |
| `onHandleArtifactClick` | `(payload: any) => void` | 预览/制品点击事件 |
| `onClick` | `(event: React.MouseEvent<HTMLDivElement>) => void` | 根容器点击事件 |
| `onMouseOver` | `(event: React.MouseEvent<HTMLElement>) => void` | 根容器鼠标悬停事件 |
| `onMouseOut` | `(event: React.MouseEvent<HTMLElement>) => void` | 根容器鼠标移出事件 |

### 使用

```tsx
import { NodeRenderer as MarkdownRender } from 'markstream-react'

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
      这是一个
      {' '}
      <strong>粗体</strong>
      {' '}
      单词。
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
    title: '示例',
    text: '点击我'
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
    title: '示例',
    raw: '![示例图片](https://example.com/image.jpg)'
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
import { getMarkdown } from 'stream-markdown-parser'

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
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# 标题\n\n这里的内容...', md)

// 与 MarkdownRender 一起使用
// <MarkdownRender nodes={nodes} />
```

### 可选 Worker（Mermaid / KaTeX）

安装后会自动加载 Mermaid/KaTeX。如需线程外解析/渲染，可注入 Worker：

```tsx
import { setKaTeXWorker, setMermaidWorker } from 'markstream-react'
import KatexWorker from 'markstream-react/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-react/workers/mermaidParser.worker?worker'

setMermaidWorker(new MermaidWorker())
setKaTeXWorker(new KatexWorker())
```

## 自定义组件 API

### Props 接口

所有自定义节点组件都接收这些 props：

```tsx
interface NodeComponentProps<TNode = ParsedNode> {
  node: TNode // 解析后的节点数据
  ctx?: RenderContext // 渲染上下文（主题、事件、开关）
  renderNode?: RenderNodeFn // 子节点渲染助手
  indexKey?: React.Key // 节点的唯一键
  customId?: string // 作用域标识符
  isDark?: boolean
  typewriter?: boolean
  children?: React.ReactNode
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

## Context + 自定义组件

可以在自定义节点组件内部使用 React Context，同时通过 `setCustomComponents` 注册组件：

```tsx
import { NodeRenderer as MarkdownRender, setCustomComponents } from 'markstream-react'
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
  const markdown = `# 自定义标题

这使用了自定义标题组件。
`

  return (
    <ThemeContext.Provider value="dark">
      <MarkdownRender customId="docs" content={markdown} />
    </ThemeContext.Provider>
  )
}
```

## 流式传输支持

markstream-react 支持流式 markdown 内容：

```tsx
import { NodeRenderer as MarkdownRender } from 'markstream-react'
import { useState } from 'react'

function StreamingDemo() {
  const [content, setContent] = useState('')
  const fullContent = `# 流式传输演示

此内容正在**逐步**流式传输。
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
import type { NodeComponentProps, NodeRendererProps } from 'markstream-react'
import type { ParsedNode } from 'stream-markdown-parser'
import { NodeRenderer as MarkdownRender } from 'markstream-react'

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

import { NodeRenderer as MarkdownRender } from 'markstream-react'
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
  () => import('markstream-react').then(mod => mod.NodeRenderer),
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
import { NodeRenderer as MarkdownRender } from 'markstream-react'
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
import { NodeRenderer as MarkdownRender } from 'markstream-react'

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
