---
title: 'Install Markstream by framework'
description: Choose the right Markstream package for Vue, Nuxt, React, Next.js, Svelte, Angular, Vue 2, or parser-only usage.
---
# Markstream framework packages

Streaming Markdown renderers for AI apps across Vue, React, Svelte, Angular, Nuxt, and Next.js.

## Choose by framework

| Framework | Package | Status | Install | Best first page | Notes |
| --- | --- | --- | --- | --- | --- |
| Vue 3 / Nuxt / VitePress | `markstream-vue` | stable | `pnpm add markstream-vue` | [Vue](/frameworks/vue) / [Nuxt](/frameworks/nuxt) | Most mature renderer |
| React / Next.js / Remix | `markstream-react` | beta | `pnpm add markstream-react` | [React](/frameworks/react) / [Next.js](/frameworks/next) | SSR entries for Next.js |
| Svelte 5 | `markstream-svelte` | beta | `pnpm add markstream-svelte svelte@^5` | [Svelte](/frameworks/svelte) | Svelte 5 only |
| Angular standalone | `markstream-angular` | alpha | `pnpm add markstream-angular` | [Angular](/frameworks/angular) | Angular 20+ standalone |
| Vue 2.6 / 2.7 | `markstream-vue2` | compatibility | `pnpm add markstream-vue2` | [Vue 2 Quick Start](/guide/vue2-quick-start) | For legacy Vue 2 apps |
| Parser only | `stream-markdown-parser` | stable | `pnpm add stream-markdown-parser` | [Parser API](/guide/parser-api) | No UI renderer |

## Choose by use case

| Use case | Best package | Why |
| --- | --- | --- |
| Vue AI chat | `markstream-vue` | Most mature renderer and the deepest Vue/Nuxt docs |
| React AI chat | `markstream-react` | React renderer for streaming chat and migration from `react-markdown` |
| Next.js SSR-first Markdown | `markstream-react/next` | Server HTML first, then client enhancement |
| Svelte 5 AI chat | `markstream-svelte` | Svelte 5 renderer with the shared Markstream parser behavior |
| Angular standalone app | `markstream-angular` | Angular 20+ standalone component package |
| Parser-only pipeline | `stream-markdown-parser` | Structured nodes without a UI runtime |

## Package maturity

| Package | Maturity | Notes |
| --- | --- | --- |
| `markstream-vue` | stable | Main renderer, most documented path |
| `stream-markdown-parser` | stable | Parser-only package shared by renderers |
| `markstream-react` | beta | React and Next.js entries are documented separately |
| `markstream-svelte` | beta / experimental | Svelte 5 only |
| `markstream-angular` | alpha | Angular standalone component |
| `markstream-vue2` | compatibility | Vue 2.6 / 2.7 legacy support |

## Quick examples

::: code-group

```vue [Vue]
<script setup>
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender mode="chat" :content="content" :final="isDone" />
</template>
```

```tsx [React]
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function Message({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

```svelte [Svelte]
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'
</script>

<MarkdownRender {content} final={isDone} />
```

```ts [Angular]
import { Component, signal } from '@angular/core'
import { MarkstreamAngularComponent } from 'markstream-angular'
import 'markstream-angular/index.css'

@Component({
  selector: 'app-message',
  imports: [MarkstreamAngularComponent],
  template: '<markstream-angular [content]="content()" [final]="true" />',
})
export class MessageComponent {
  content = signal('# Hello from Markstream')
}
```

:::

## Common questions

### Is Markstream only for Vue?

No. `markstream-vue` is the most mature package, but Markstream also has React, Svelte, Angular, Vue 2, Next.js, and parser-only entries.

### Should I use Markstream or marked / markdown-it?

Use `marked` or `markdown-it` when you only need `markdown -> HTML`. Use Markstream when Markdown is rendered as framework components, changes during streaming, or needs stable AI-chat mid-states.

### Should I use markstream-react or react-markdown?

Use `react-markdown` for short static React Markdown and mature remark/rehype plugin chains. Use `markstream-react` for streaming AI output, incomplete Markdown states, long responses, progressive Mermaid, or shared behavior with Vue/Svelte/Angular.

### Which packages are stable?

`markstream-vue` and `stream-markdown-parser` are stable. `markstream-react` is beta, `markstream-svelte` is beta / experimental, `markstream-angular` is alpha, and `markstream-vue2` is a compatibility port.

## Common next steps

- Use [Vue / Nuxt installation](/guide/installation) after choosing `markstream-vue`.
- Use [React installation](/guide/react-installation) after choosing `markstream-react`.
- Use [Svelte Quick Start](/guide/svelte) after choosing `markstream-svelte`.
- Use [Angular installation](/guide/angular-installation) after choosing `markstream-angular`.
