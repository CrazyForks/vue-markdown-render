# vue-renderer-markdown

> Fast, streaming-friendly Markdown rendering for Vue 3 — progressive Mermaid, streaming diff code blocks, and real-time previews optimized for large documents.

[![NPM version](https://img.shields.io/npm/v/vue-renderer-markdown?color=a1b858&label=)](https://www.npmjs.com/package/vue-renderer-markdown)
[![中文版](https://img.shields.io/badge/docs-中文文档-blue)](README.zh-CN.md)
[![Docs](https://img.shields.io/badge/docs-vitepress-blue)](https://vue-markdown-renderer-docs.simonhe.me/)
[![NPM downloads](https://img.shields.io/npm/dm/vue-renderer-markdown)](https://www.npmjs.com/package/vue-renderer-markdown)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/vue-renderer-markdown)](https://bundlephobia.com/package/vue-renderer-markdown)
[![License](https://img.shields.io/npm/l/vue-renderer-markdown)](./LICENSE)

> 📖 All detailed documentation, API, examples, and advanced usage have been migrated to the VitePress documentation site:
> https://vue-markdown-renderer-docs.simonhe.me/guide/

## 🚀 Playground & Demo

- Playground (interactive demo): https://vue-markdown-renderer.simonhe.me/
- Interactive test page: https://vue-markdown-renderer.simonhe.me/test

Try the interactive test page to quickly verify and debug:
https://vue-markdown-renderer.simonhe.me/test

This page provides a left editor and right live preview (powered by this library). It includes "generate & copy share link" functionality, encoding your input into the URL for sharing. If the input is too long, fallback options are provided to open directly or pre-fill a GitHub Issue.

You can use this page to reproduce rendering issues, verify math/Mermaid/code block behavior, and quickly generate shareable links or reproducible issues.

## 📺 Introduction Video

A short video introduces the key features and usage of vue-renderer-markdown:

[![Watch on Bilibili](https://i1.hdslb.com/bfs/archive/f073718bd0e51acaea436d7197880478213113c6.jpg)](https://www.bilibili.com/video/BV17Z4qzpE9c/)

Watch on Bilibili: [Open in Bilibili](https://www.bilibili.com/video/BV17Z4qzpE9c/)

## Features

- ⚡ Extreme performance: minimal re-rendering and efficient DOM updates for streaming scenarios
- 🌊 Streaming-first: native support for incomplete or frequently updated tokenized Markdown
- 🧠 Monaco streaming updates: high-performance Monaco integration for smooth incremental updates of large code blocks
- 🪄 Progressive Mermaid: charts render instantly when syntax is available, and improve with later updates
- 🧩 Custom components: embed custom Vue components in Markdown content
- 📝 Full Markdown support: tables, formulas, emoji, checkboxes, code blocks, etc.
- 🔄 Real-time updates: supports incremental content without breaking formatting
- 📦 TypeScript-first: complete type definitions and IntelliSense
- 🔌 Zero config: works out of the box in Vue 3 projects
- 🎨 Flexible code block rendering: choose Monaco editor (`CodeBlockNode`) or lightweight Shiki highlighting (`MarkdownCodeBlockNode`)

## Troubleshooting & Common Issues

Troubleshooting has moved into the docs:
https://vue-markdown-renderer-docs.simonhe.me/guide/troubleshooting

If you can't find a solution there, open a GitHub issue:
https://github.com/Simon-He95/vue-markdown-render/issues

## Thanks

This project uses and benefits from:
- [stream-monaco](https://github.com/Simon-He95/stream-monaco)
- [stream-markdown](https://github.com/Simon-He95/stream-markdown)
- [mermaid](https://mermaid-js.github.io/mermaid)
- [shiki](https://github.com/shikijs/shiki)

Thanks to the authors and contributors of these projects!

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Simon-He95/vue-markdown-render&type=Date)](https://www.star-history.com/#Simon-He95/vue-markdown-render&Date)

## License

[MIT](./LICENSE) © [Simon He](https://github.com/Simon-He95)
