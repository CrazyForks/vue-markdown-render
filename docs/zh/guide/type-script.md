# TypeScript 使用（中文）

本库以 TypeScript 为首选语言，导出公共 API 类型。使用 `import type` 来获取节点定义以用于高级用法。

```ts
import type { BaseNode } from 'vue-renderer-markdown'
import { getMarkdown } from 'vue-renderer-markdown'
```

## 强类型自定义组件

你可以强类型化自定义组件以接收节点特定 props，例如：

```vue
<script setup lang="ts">
import type { CodeBlockNode } from 'vue-renderer-markdown'

const props = defineProps<{ node: CodeBlockNode }>()
</script>

<template>
  <pre class="custom-code">
    <code :data-lang="props.node.language">{{ props.node.code }}</code>
  </pre>
</template>
```

然后注册该组件：

```ts
import { setCustomComponents } from 'vue-renderer-markdown'

setCustomComponents('docs', {
  code_block: CustomCodeBlock,
})
```

此种方式支持类型检查与智能提示。
