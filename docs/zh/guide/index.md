# 指南

## 选择你的框架

本文档涵盖多个框架版本。选择你偏好的框架：

### Vue 3 (markstream-vue) ⭐ 推荐

最新版本，功能最丰富。

| 页面 | 描述 |
|------|------|
| [安装](/zh/guide/installation) | 安装和依赖配置 |
| [快速开始](/zh/guide/quick-start) | 快速上手指南 |
| [功能特性](/zh/guide/features) | 流式渲染、Mermaid、Monaco 等 |
| [组件 API](/zh/guide/components) | 完整组件参考 |
| [使用与 API](/zh/guide/usage) | 高级使用模式 |

### Vue 2 (markstream-vue2)

适用于 Vue 2.6+（需要 Composition API）和 Vue 2.7+ 项目。

| 页面 | 描述 |
|------|------|
| [安装](/zh/guide/vue2-installation) | Vue 2 专用安装 |
| [快速开始](/zh/guide/vue2-quick-start) | Vue 2 示例 |
| [组件与 API](/zh/guide/vue2-components) | Vue 2 组件参考 |

### React (markstream-react)

适用于 React 18+ 项目，支持 hooks 和 TypeScript。

| 页面 | 描述 |
|------|------|
| [安装](/zh/guide/react-installation) | React 专用安装 |
| [快速开始](/zh/guide/react-quick-start) | React 示例 |
| [组件与 API](/zh/guide/react-components) | React 组件参考 |

### Nuxt

适用于 Nuxt 3 SSR 应用程序。

- [Nuxt SSR 指南](/nuxt-ssr) - 服务端渲染配置

---

## 快速体验

在你的应用中直接渲染简短指南：

```vue
<script setup>
import MarkdownRender from 'markstream-vue'

const md = '# 欢迎使用指南\n\n这是一个简短示例。'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

使用左侧边栏导航深入了解所有主题。
