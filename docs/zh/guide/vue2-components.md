# Vue 2 组件与 API

markstream-vue2 提供与 markstream-vue 相同强大的组件，但专为 Vue 2 构建。所有组件都兼容 Vue 2.6+（配合 `@vue/composition-api`）和 Vue 2.7+。

## 主组件：MarkdownRender

在 Vue 2 中渲染 markdown 内容的主要组件。

### Props

| 属性 | 类型 | 默认值 | 描述 |
|------|------|---------|-------------|
| `content` | `string` | - | 要渲染的 Markdown 内容 |
| `nodes` | `ParsedNode[]` | - | 预解析的 AST 节点（`content` 的替代方案） |
| `custom-id` | `string` | `'default'` | 自定义组件作用域标识符 |
| `max-live-nodes` | `number` | `100` | 虚拟化最大渲染节点数 |
| `live-node-buffer` | `number` | `5` | 虚拟化过扫描缓冲区 |
| `batch-rendering` | `boolean` | `false` | 启用增量批处理渲染 |
| `defer-nodes-until-visible` | `boolean` | `true` | 延迟渲染重型节点直到可见 |
| `render-code-blocks-as-pre` | `boolean` | `false` | 将代码块回退为 `<pre><code>` |
| `before-render` | `Function` | - | 渲染开始前的回调 |
| `after-render` | `Function` | - | 渲染完成后的回调 |

### 使用

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      markdown: '# Hello Vue 2!'
    }
  },
  methods: {
    handleBeforeRender() {
      console.log('渲染开始')
    },
    handleAfterRender() {
      console.log('渲染完成')
    }
  }
}
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="markdown"
    :max-live-nodes="150"
    @before-render="handleBeforeRender"
    @after-render="handleAfterRender"
  />
</template>
```

## 代码块组件

### MarkdownCodeBlockNode

使用 Shiki 的轻量级代码高亮。

```vue
<script>
import { MarkdownCodeBlockNode } from 'markstream-vue2'

export default {
  components: { MarkdownCodeBlockNode },
  data() {
    return {
      codeNode: {
        type: 'code_block',
        language: 'javascript',
        code: 'const hello = "world"',
        raw: 'const hello = "world"'
      }
    }
  },
  methods: {
    handleCopy() {
      alert('代码已复制！')
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MarkdownCodeBlockNode
      :node="codeNode"
      :show-copy-button="true"
      @copy="handleCopy"
    >
      <template #header-right>
        <span class="lang-badge">{{ codeNode.language }}</span>
      </template>
    </MarkdownCodeBlockNode>
  </div>
</template>
```

### CodeBlockNode

功能丰富的 Monaco 驱动代码块。

```vue
<script>
import { CodeBlockNode } from 'markstream-vue2'

export default {
  components: { CodeBlockNode },
  data() {
    return {
      codeNode: {
        type: 'code_block',
        language: 'typescript',
        code: 'const greeting: string = "Hello"',
        raw: 'const greeting: string = "Hello"'
      }
    }
  },
  methods: {
    handleMonacoReady(editor) {
      console.log('Monaco 编辑器已就绪：', editor)
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <CodeBlockNode
      :node="codeNode"
      :monaco-options="{ fontSize: 14, theme: 'vs-dark' }"
      :stream="true"
      @ready="handleMonacoReady"
    />
  </div>
</template>
```

## 数学组件

### MathBlockNode

使用 KaTeX 渲染块级数学公式。

```vue
<script>
import { MathBlockNode } from 'markstream-vue2'

export default {
  components: { MathBlockNode },
  data() {
    return {
      mathNode: {
        type: 'math_block',
        content: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
        raw: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}'
      }
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MathBlockNode
      :node="mathNode"
      :display-mode="true"
      :macros="{ '\\RR': '\\mathbb{R}' }"
      :throw-on-error="false"
    />
  </div>
</template>
```

### MathInlineNode

渲染行内数学公式。

```vue
<script>
import { MathInlineNode } from 'markstream-vue2'

export default {
  components: { MathInlineNode },
  data() {
    return {
      inlineMathNode: {
        type: 'math_inline',
        content: 'E = mc^2',
        raw: 'E = mc^2'
      }
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <p>
      公式如下：
      <MathInlineNode :node="inlineMathNode" />
    </p>
  </div>
</template>
```

## Mermaid 图表

### MermaidBlockNode

渐进式 Mermaid 图表渲染。

```vue
<script>
import { MermaidBlockNode } from 'markstream-vue2'

export default {
  components: { MermaidBlockNode },
  data() {
    return {
      mermaidNode: {
        type: 'mermaid_block',
        content: `graph TD
    A[开始] --> B{能用吗？}
    B -->|是| C[太好了！]`,
        raw: ''
      }
    }
  },
  methods: {
    handleMermaidRender(svg) {
      console.log('Mermaid 图表已渲染：', svg)
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MermaidBlockNode
      :node="mermaidNode"
      theme="forest"
      :is-strict="true"
      @render="handleMermaidRender"
    />
  </div>
</template>
```

## 工具函数

### setCustomComponents

为特定的 markdown 节点注册自定义节点渲染器。

```js
import { setCustomComponents } from 'markstream-vue2'

// 定义自定义组件
const CustomHeading = {
  name: 'CustomHeading',
  props: ['node', 'indexKey', 'customId'],
  render(h) {
    const level = this.node.level || 1
    return h(`h${level}`, {
      class: 'custom-heading',
      attrs: { 'data-custom-id': this.customId }
    }, this.node.children.map(c => c.content))
  }
}

// 全局注册
setCustomComponents('docs', {
  heading: CustomHeading
})
```

### getMarkdown

获取配置好的 markdown-it 实例。

```js
import { getMarkdown } from 'markstream-vue2'

const md = getMarkdown('my-msg-id', {
  html: true,
  linkify: true,
  typographer: true
})

const tokens = md.parse('# Hello World')
```

### parseMarkdownToStructure

将 markdown 字符串解析为 AST 结构。

```js
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue2'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# 标题\n\n这里的内容...', md)

// 与 MarkdownRender 一起使用
// <MarkdownRender :nodes="nodes" />
```

### enableKatex / enableMermaid

为 KaTeX 和 Mermaid 启用功能加载器。

```js
import { enableKatex, enableMermaid } from 'markstream-vue2'

// 启用 KaTeX worker
enableKatex()

// 启用 Mermaid worker
enableMermaid()
```

## 自定义组件 API

### Props 接口

所有自定义节点组件都接收这些 props：

```ts
interface NodeComponentProps {
  node: ParsedNode // 解析后的节点数据
  indexKey: number | string // 节点的唯一键
  customId?: string // 用于作用域的自定义 ID
}
```

### 示例自定义组件

```vue
<script>
export default {
  name: 'CustomParagraph',
  props: {
    node: {
      type: Object,
      required: true
    },
    indexKey: {
      type: [Number, String],
      default: 0
    },
    customId: {
      type: String,
      default: 'default'
    }
  },
  computed: {
    tag() {
      return 'p'
    },
    classes() {
      return [
        'custom-paragraph',
        `custom-paragraph-${this.indexKey}`
      ]
    },
    attrs() {
      return {
        'data-custom-id': this.customId,
        'data-node-type': this.node.type
      }
    }
  }
}
</script>

<template>
  <component
    :is="tag"
    :class="classes"
    v-bind="attrs"
  >
    <slot>
      <template v-for="(child, i) in node.children">
        <span v-if="child.type === 'text'" :key="i">
          {{ child.content }}
        </span>
        <!-- 处理其他节点类型... -->
      </template>
    </slot>
  </component>
</template>

<style scoped>
.custom-paragraph {
  line-height: 1.7;
  color: #333;
}
</style>
```

## 流式传输支持

markstream-vue2 支持流式 markdown 内容，节点上带有 `loading` 状态：

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      streamingContent: '',
      fullContent: `# 流式传输演示

此内容正在**逐字符**流式传输。

\`\`\`javascript
console.log('流式传输中...')
\`\`\`
`
    }
  },
  mounted() {
    this.startStreaming()
  },
  methods: {
    startStreaming() {
      let i = 0
      const interval = setInterval(() => {
        if (i < this.fullContent.length) {
          this.streamingContent += this.fullContent[i]
          i++
        }
        else {
          clearInterval(interval)
        }
      }, 30)
    }
  }
}
</script>

<template>
  <div>
    <MarkdownRender :content="streamingContent" />
  </div>
</template>
```

## TypeScript 支持

markstream-vue2 包含完整的 TypeScript 类型定义。对于 Vue 2.6.x，配置你的 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "types": ["@vue/composition-api", "markstream-vue2"],
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

对于 Vue 2.7+，类型会自动包含：

```ts
import type { ParsedNode } from 'markstream-vue2'
import MarkdownRender, { MarkdownRenderProps } from 'markstream-vue2'

// 你的组件具有适当的类型
import { defineComponent } from 'vue'

export default defineComponent({
  components: { MarkdownRender },
  setup() {
    const markdown = ref('# Hello')
    const nodes = ref<ParsedNode[]>([])

    return { markdown, nodes }
  }
})
```

## 与 Vue 3 版本的差异

Vue 2 版本与 Vue 3 版本保持 API 兼容，但需要注意以下几点：

1. **Composition API**：Vue 2.6.x 需要 `@vue/composition-api`，Vue 2.7+ 内置支持
2. **插槽**：使用 Vue 2 的作用域插槽语法
3. **事件名称**：在模板中使用短横线命名的事件名称
4. **v-model**：无需更改，使用方式相同

## 下一步

- 查看 [Vue 2 快速开始](/guide/vue2-quick-start) 获取设置示例
- 探索 [Vue 3 组件](/guide/components) 获取更多组件示例（API 相同）
- 查看 [使用与 API](/guide/usage) 获取高级模式
