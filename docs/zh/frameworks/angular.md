---
title: Angular 流式 Markdown 渲染器
description: 使用 markstream-angular 这个 Angular 20+ standalone alpha 渲染器，在 AI 聊天、LLM token 流、SSE/WebSocket、未闭合 Markdown、Mermaid、KaTeX 和长文档场景中渲染流式 Markdown。
keywords:
  - markstream-angular
  - Angular 流式 Markdown 渲染器
  - Angular AI 聊天 Markdown
  - Angular LLM Markdown 渲染器
  - Angular SSE Markdown
  - Angular WebSocket Markdown
  - Angular 未闭合 Markdown
  - Angular Mermaid Markdown
  - Angular KaTeX Markdown
  - ngx-markdown 替代方案
  - Angular standalone Markdown
  - Angular 20 Markdown 渲染器
softwareName: markstream-angular
softwarePackage: markstream-angular
npmPackage: markstream-angular
softwareFramework: Angular
softwareProgrammingLanguage:
  - TypeScript
  - Angular
softwareRuntimePlatform:
  - Angular
  - Angular standalone components
faq:
  - question: markstream-angular 要求 Angular 20 吗？
    answer: 是。当前包面向 Angular 20+ standalone 组件。
  - question: markstream-angular 稳定了吗？
    answer: 还没有。markstream-angular 当前是 alpha，生产使用前应先查看当前包文档和版本说明。
  - question: 应该用 markstream-angular 替代 ngx-markdown 吗？
    answer: 只有在你明确需要 Angular 流式 Markdown 中间态渲染时才优先评估 markstream-angular。短静态 Markdown 或流结束后一次性渲染，更成熟的完成态 Markdown 渲染器可能更合适。
  - question: Angular SSE 输出一定要预解析 nodes 吗？
    answer: 不需要。优先传不断累积的 content 字符串和 final 状态。只有当外层已经负责解析或 AST transform 时，再使用 nodes。
  - question: markstream-angular 会把 Markdown 直接塞进 innerHTML 吗？
    answer: 它是组件化渲染器，设计目标是避免把不可信 Markdown 直接作为 raw innerHTML 输出。
---

# Angular 流式 Markdown 渲染器

`markstream-angular` 提供 Angular 20+ standalone 组件，用于 AI 聊天、LLM token 流、SSE/WebSocket 输出、未闭合 Markdown 中间态、长 Markdown 回答、Mermaid、KaTeX 和代码块渲染。它不依赖 `[innerHTML]` 直接倾倒 HTML，而是沿用 Markstream 的组件化渲染和安全 HTML 策略。

当前包要求 Angular 20+，并且仍是 Markstream 家族里的 alpha 渲染器。如果你的项目低于 Angular 20，或要求今天就得到最稳定的生产 API，先不要直接接入这个包。

```bash
pnpm add markstream-angular
```

```ts
import { Component, signal } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { MarkstreamAngularComponent } from 'markstream-angular'
import 'markstream-angular/index.css'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: '<markstream-angular [content]="content()" [final]="true" />',
})
class AppComponent {
  readonly content = signal('# Hello Angular')
}

bootstrapApplication(AppComponent)
```

| 场景 | 推荐 |
| --- | --- |
| Angular standalone 应用 | 使用 `MarkstreamAngularComponent` |
| AI 聊天流式输出 | 用 signal 累积 `content` 并传 `final` |
| Mermaid / KaTeX | 需要时再安装对应 peer |
| 稳定 API 要求很高 | 注意当前仍是 alpha |

普通 AI 聊天不需要手动预解析 nodes；先把不断累积的 Markdown 字符串传给 `content`。只有外层已经负责解析、batch、worker 执行或 AST transform 时，再使用 `nodes` 路径。

不适合的情况：Angular <20、只渲染短静态 Markdown、只想在 SSE 结束后一次性渲染完成文本，或希望今天就得到最稳定的生产 API。这类场景应先评估已有 Angular Markdown 栈。
