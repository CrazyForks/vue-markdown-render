# 快速开始

示例：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = `# Hello World\n\n这是 **加粗** 的文本。`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

说明：本包的 CSS 会限定在内部 `.markstream-vue` 容器下，以尽量减少对宿主应用全局样式的影响；正常使用 `MarkdownRender` 无需额外处理。

暗色变量支持两种方式：给祖先节点加 `.dark`，或给 `MarkdownRender` 传入 `:is-dark="true"`（仅对渲染器生效）。

如果使用 Nuxt 或 SSR，请用 `<client-only>` 包裹。

快速试一下：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = `# Hello world

试试 Mermaid：

\`\`\`mermaid
graph LR
A-->B
\`\`\`

试试 D2：

\`\`\`d2
direction: right
Client -> API: request
API -> DB: query
DB -> API: rows
API -> Client: response
\`\`\`
`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

安装 `mermaid` 或 `@terrastruct/d2` 才能看到图表预览；未安装时会回退为源码展示。
