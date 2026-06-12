---
title: 'Angular streaming Markdown renderer for AI chat'
description: Use markstream-angular standalone component to render streamed Markdown in Angular AI chat, SSE, WebSocket, Mermaid, KaTeX, and long documents.
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
---
# Angular streaming Markdown renderer for AI chat

`markstream-angular` provides a standalone Angular component for streamed Markdown surfaces such as AI chat, SSE output, WebSocket output, long documents, Mermaid, KaTeX, and streaming code blocks.

## When to use markstream-angular

Use `markstream-angular` when:

- Content streams from an LLM, SSE, or WebSocket into an Angular standalone app
- You need progressive Mermaid diagrams in Angular
- KaTeX math rendering during streaming matters
- You need safe HTML rendering in Angular without `[innerHTML]`
- Long AI responses need virtualized rendering

## Quick Start

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
  template: `
    <markstream-angular
      [content]="markdown()"
      [final]="true"
    />
  `,
})
class AppComponent {
  readonly markdown = signal(`# Hello Angular

This is **markstream-angular**.`)
}

bootstrapApplication(AppComponent)
```

## Streaming SSE example

```ts
import { Component, signal } from '@angular/core'
import { MarkstreamAngularComponent } from 'markstream-angular'

@Component({
  selector: 'chat-message',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: `
    <markstream-angular
      [content]="content()"
      [final]="final()"
      [fade]="false"
    />
  `,
})
export class ChatMessageComponent {
  readonly content = signal('')
  readonly final = signal(false)
}
```

## Optional peers and what they enable

| Peer | Enables |
| --- | --- |
| `mermaid` | Mermaid diagrams |
| `katex` | Inline and block math rendering |
| `stream-monaco` | Monaco-powered code blocks |
| `@terrastruct/d2` | D2 diagrams |
| `@antv/infographic` | Infographic blocks |

Shiki is not documented for `markstream-angular` unless you add a supported integration path.

## When not to use this package

- You are below Angular 20
- You only render short static Markdown and do not need streaming mid-state handling
- You need a fully stable API surface today

## Known limitations / maturity

- **Standalone component**: no NgModule required
- **Signal-based**: works with Angular signals for reactive content
- **Safe HTML**: no `[innerHTML]` needed
- **Progressive Mermaid**: diagrams render incrementally
- **KaTeX math**: with worker support
- **Streaming code blocks**: with diff tracking
- **Optional peers**: install only what you need
- **Alpha status**: check npm and the [Angular guide](/guide/angular-quick-start) for the latest API maturity

## Try it

- [Live playground](https://markstream-angular.pages.dev/)
- [Full documentation](/guide/angular-quick-start)
