---
title: Nuxt 流式 Markdown 渲染器
description: 在 Nuxt 中使用 markstream-vue 渲染 SSR-first Markdown、AI 聊天流式输出、client-only 重型 peer 和 Web Worker。
softwareName: markstream-vue
softwarePackage: markstream-vue
npmPackage: markstream-vue
softwareFramework: Nuxt
softwareProgrammingLanguage:
  - TypeScript
  - Vue
softwareRuntimePlatform:
  - Nuxt
  - Vue 3
---

# Nuxt 流式 Markdown 渲染器

Nuxt 项目通常同时有 SSR 内容和浏览器专属能力。`markstream-vue` 可以处理 SSR-first Markdown，也可以在 client-only 区域承接 AI 聊天、SSE/WebSocket、Mermaid、KaTeX、Monaco 等重型能力。关键是不要把所有 Nuxt 使用方式都包进 `<ClientOnly>`；只有依赖浏览器 API 的部分才需要 client boundary。

```bash
pnpm add markstream-vue
```

```ts
// plugins/markstream.client.ts
import { defineNuxtPlugin } from '#app'
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.component('MarkdownRender', MarkdownRender)
})
```

| 需求 | 推荐路径 |
| --- | --- |
| 普通 Markdown SSR | 先走 Vue/Nuxt 基础渲染 |
| AI 聊天实时输出 | 在 client 组件里传 `content` 和 `final` |
| Mermaid / Monaco | 放在浏览器边界后启用 |
| 移动端 Nuxt WebView | 使用 `index.px.css` 并测试字体缩放 |

不适合的情况：只需要构建时渲染静态 Markdown，或 Nuxt 页面完全不涉及流式更新、重型块和长文档。
