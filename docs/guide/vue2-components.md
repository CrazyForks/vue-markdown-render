# Vue 2 Components & API

markstream-vue2 provides the same powerful components as markstream-vue, but built for Vue 2. All components are compatible with Vue 2.6+ (with `@vue/composition-api`) and Vue 2.7+.

## Main Component: MarkdownRender

The primary component for rendering markdown content in Vue 2.

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | - | Markdown content to render |
| `nodes` | `ParsedNode[]` | - | Pre-parsed AST nodes (alternative to `content`) |
| `custom-id` | `string` | `'default'` | Identifier for custom component scoping |
| `max-live-nodes` | `number` | `100` | Max number of rendered nodes for virtualization |
| `live-node-buffer` | `number` | `5` | Buffer for overscan in virtualization |
| `batch-rendering` | `boolean` | `false` | Enable incremental batched rendering |
| `defer-nodes-until-visible` | `boolean` | `true` | Defer heavy nodes until visible |
| `render-code-blocks-as-pre` | `boolean` | `false` | Fall back to `<pre><code>` for code blocks |

### Usage

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
  }
}
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="markdown"
    :max-live-nodes="150"
  />
</template>
```

## Code Block Components

### MarkdownCodeBlockNode

Lightweight code highlighting using Shiki.

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
      alert('Code copied!')
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

Feature-rich Monaco-powered code blocks.

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
    handleCopy(code) {
      console.log('Code copied:', code)
    },
    handlePreviewCode(artifact) {
      console.log('Preview code:', artifact)
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
      @copy="handleCopy"
      @preview-code="handlePreviewCode"
    />
  </div>
</template>
```

## Math Components

### MathBlockNode

Renders block-level math formulas with KaTeX.

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
    />
  </div>
</template>
```

### MathInlineNode

Renders inline math formulas.

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
      The formula is:
      <MathInlineNode :node="inlineMathNode" />
    </p>
  </div>
</template>
```

## Mermaid Diagrams

### MermaidBlockNode

Progressive Mermaid diagram rendering.

```vue
<script>
import { MermaidBlockNode } from 'markstream-vue2'

export default {
  components: { MermaidBlockNode },
  data() {
    return {
      mermaidNode: {
        type: 'code_block',
        language: 'mermaid',
        code: `graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]`,
        raw: ''
      }
    }
  },
  methods: {
    onExport(ev) {
      console.log('Mermaid SVG:', ev.svgString)
    }
  }
}
</script>

<template>
  <div class="markstream-vue">
    <MermaidBlockNode
      :node="mermaidNode"
      :is-strict="true"
      @export="onExport"
    />
  </div>
</template>
```

## Utility Functions

### setCustomComponents

Register custom node renderers for specific markdown nodes.

```js
import { setCustomComponents } from 'markstream-vue2'

// Define custom component
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

// Register globally
setCustomComponents('docs', {
  heading: CustomHeading
})
```

### getMarkdown

Get a configured markdown-it instance.

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

Parse markdown string to AST structure.

```js
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue2'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# Title\n\nContent here...', md)

// Use with MarkdownRender
// <MarkdownRender :nodes="nodes" />
```

### enableKatex / enableMermaid

Enable feature loaders for KaTeX and Mermaid.

```js
import { enableKatex, enableMermaid } from 'markstream-vue2'

// Enable KaTeX worker
enableKatex()

// Enable Mermaid worker
enableMermaid()
```

## Custom Component API

### Props Interface

All custom node components receive these props:

```ts
interface NodeComponentProps {
  node: ParsedNode // The parsed node data
  indexKey: number | string // Unique key for the node
  customId?: string // Custom ID for scoping
}
```

### Example Custom Component

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
        <!-- Handle other node types... -->
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

## Streaming Support

markstream-vue2 supports streaming markdown content with the `loading` state on nodes:

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return {
      streamingContent: '',
      fullContent: `# Streaming Demo

This content streams in **character by character**.

\`\`\`javascript
console.log('Streaming...')
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

## TypeScript Support

markstream-vue2 includes full TypeScript definitions. For Vue 2.6.x, configure your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@vue/composition-api", "markstream-vue2"],
    "moduleResolution": "node",
    "esModuleInterop": true
  }
}
```

For Vue 2.7+, types are included automatically:

```ts
import type { ParsedNode } from 'markstream-vue2'
import MarkdownRender, { MarkdownRenderProps } from 'markstream-vue2'

// Your component with proper typing
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

## Differences from Vue 3 Version

The Vue 2 version maintains API compatibility with the Vue 3 version with these considerations:

1. **Composition API**: Requires Vue 2.7+ or `@vue/composition-api` for Vue 2.6.x
2. **Slots**: Use Vue 2 scoped slot syntax
3. **Event names**: Use kebab-case for event names in templates
4. **v-model**: No changes needed, works the same way

## Next Steps

- See [Vue 2 Quick Start](/guide/vue2-quick-start) for setup examples
- Explore [Vue 3 Components](/guide/components) for more component examples (API is the same)
- Check [Usage & API](/guide/usage) for advanced patterns
