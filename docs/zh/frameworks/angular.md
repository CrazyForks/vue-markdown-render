---
title: Angular 流式 Markdown 渲染器
description: 使用 markstream-angular standalone 组件在 Angular AI 聊天、SSE/WebSocket、Mermaid、KaTeX 和长文档场景中渲染流式 Markdown。
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
  - question: markstream-angular 会把 Markdown 直接塞进 innerHTML 吗？
    answer: 它是组件化渲染器，设计目标是避免把不可信 Markdown 直接作为 raw innerHTML 输出。
---

# Angular 流式 Markdown 渲染器

`markstream-angular` 提供 standalone Angular 组件，用于 AI 聊天、SSE/WebSocket 输出、长 Markdown 回答、Mermaid、KaTeX 和代码块渲染。它不依赖 `[innerHTML]` 直接倾倒 HTML，而是沿用 Markstream 的组件化渲染和安全 HTML 策略。

当前包要求 Angular 20+。如果你的项目低于 Angular 20，先不要直接接入这个包。

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

不适合的情况：Angular <20、只渲染短静态 Markdown、或希望今天就得到最稳定的生产 API。
