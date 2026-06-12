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

## Key capabilities

- **Standalone component**: no NgModule required
- **Signal-based**: works with Angular signals for reactive content
- **Safe HTML**: no `[innerHTML]` needed
- **Progressive Mermaid**: diagrams render incrementally
- **KaTeX math**: with worker support
- **Streaming code blocks**: with diff tracking
- **Optional peers**: install only what you need

## Package maturity

`markstream-angular` is at `0.0.3` (alpha). Check the [Angular guide](/guide/angular-quick-start) for current API maturity and known limitations.

## Try it

- [Live playground](https://markstream-angular.pages.dev/)
- [Full documentation](/guide/angular-quick-start)
