# TypeScript Usage

This library is TypeScript-first and exports types for the public API. Use `import type` to get node definitions in your code for advanced manipulations.

```ts
import type { BaseNode } from 'vue-renderer-markdown'
import { getMarkdown } from 'vue-renderer-markdown'
```

See `packages/markdown-parser/src` for type definitions used by the parser.

## Strongly typed custom components

You can strongly type your custom components to accept node-specific props. Example:

```vue
<!-- components/CustomCodeBlock.vue -->
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

Then register the component for a specific custom id or globally:

```ts
import { setCustomComponents } from 'vue-renderer-markdown'

setCustomComponents('docs', {
  code_block: CustomCodeBlock,
})
```

This approach provides full TypeScript checking and code completion for node props inside your components.
