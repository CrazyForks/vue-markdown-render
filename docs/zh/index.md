# markstream-vue (中文)

适用于 Vue 3 的流式 Markdown 渲染器，支持 Mermaid 图表、流式代码块对比和高性能大文档处理。

<div class="star-reminder-inline">

如果你觉得 markstream-vue 对你有帮助，请考虑在 GitHub 上<a href="https://github.com/Simon-He95/markstream-vue" target="_blank" rel="noopener noreferrer">给我们一个 star ⭐</a>！

</div>

## 选择你的框架

markstream 支持多种框架。选择你偏好的框架查看对应文档和示例：

::: tip 框架支持
所有版本共享相同的核心功能，并提供针对各框架优化的 API。
:::

### Vue 3 (markstream-vue) ⭐ 推荐

最新版本，完整支持 Vue 3 Composition API。

- **文档入口**：[/zh/guide/](/zh/guide/)
- **安装**：[/zh/guide/installation](/zh/guide/installation)
- **快速开始**：[/zh/guide/quick-start](/zh/guide/quick-start)
- **组件 API**：[/zh/guide/components](/zh/guide/components)
- **在线演示**：https://markstream-vue.simonhe.me/

```vue
<script setup>
import MarkdownRender from 'markstream-vue'

const md = '# Hello Vue 3!'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

### Vue 2 (markstream-vue2)

完整支持 Vue 2.6+（需要 Composition API）和 Vue 2.7+。

- **文档入口**：[/zh/guide/vue2-quick-start](/zh/guide/vue2-quick-start)
- **安装**：[/zh/guide/vue2-installation](/zh/guide/vue2-installation)
- **快速开始**：[/zh/guide/vue2-quick-start](/zh/guide/vue2-quick-start)
- **组件与 API**：[/zh/guide/vue2-components](/zh/guide/vue2-components)
- **在线演示**：https://markstream-vue2.netlify.app/

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data() {
    return { markdown: '# Hello Vue 2!' }
  }
}
</script>

<template>
  <MarkdownRender :content="markdown" />
</template>
```

### React (markstream-react)

支持 React 18+，完整的 hooks 和 TypeScript 支持。

- **文档入口**：[/zh/guide/react-quick-start](/zh/guide/react-quick-start)
- **安装**：[/zh/guide/react-installation](/zh/guide/react-installation)
- **快速开始**：[/zh/guide/react-quick-start](/zh/guide/react-quick-start)
- **组件与 API**：[/zh/guide/react-components](/zh/guide/react-components)
- **在线演示**：https://markstream-react.netlify.app/

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  return <MarkdownRender content="# Hello React!" />
}
```

### Nuxt (markstream-vue)

支持 Nuxt 3 服务端渲染。

- **文档**：[/nuxt-ssr](/nuxt-ssr)
- **在线演示**：https://markstream-nuxt.netlify.app/

## 快速链接

**通用资源**
- [故障排除](/guide/troubleshooting) - CSS/reset 顺序、依赖项和常见问题
- [解析器 API](/guide/parser-api) - 高级解析和 AST 操作
- [功能特性](/guide/features) - 流式渲染、Mermaid、Monaco 等

**AI/LLM 集成**
- [AI/LLM 上下文](/llms.zh-CN)（中文）
