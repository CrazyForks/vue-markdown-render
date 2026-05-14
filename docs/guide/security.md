# Security

`MarkdownRender` defaults to `htmlPolicy="safe"`. This is the right default for AI output and other content that should allow a small, sanitized HTML subset.

## HTML policies

### `htmlPolicy="safe"`

Allows common structural HTML such as links, images, lists, tables, and details blocks. Dangerous tags, event attributes, unsafe URL protocols, and inline styles are removed or escaped before rendering.

`safe` is a constrained rendering policy, not a permission to render arbitrary active HTML. For public UGC or third-party feeds, prefer `htmlPolicy="escape"`.

Use this for AI chat, docs generated from trusted pipelines, and general Markdown surfaces where limited HTML is useful.

### `htmlPolicy="escape"`

Renders all HTML as text.

Use this for untrusted user-generated content, public comments, third-party feeds, or any place where raw HTML is not required.

```vue
<MarkdownRender
  :content="content"
  html-policy="escape"
/>
```

### `htmlPolicy="trusted"`

Keeps a broader HTML set while still dropping hard-blocked tags such as scripts. Use it only for content you fully control.
It may keep inline styles and broader HTML. Do not use it for model output or user-generated content.

## Custom components

`customHtmlTags` marks tags as structured streaming nodes. It does not make model output trusted.

Custom components are trusted code. Markstream sanitizes the HTML attrs it passes into custom components, but it cannot control what your component does internally. Avoid `v-html` on raw model content, executing URLs from model output, or assigning model output directly to `iframe srcdoc`.

Prefer text interpolation inside custom components:

```vue
<script setup lang="ts">
defineProps<{ node: { content?: string } }>()
</script>

<template>
  <div class="thinking-node">
    {{ node.content }}
  </div>
</template>
```

## Links and images

Markdown links and rendered HTML attrs are checked for unsafe protocols such as `javascript:`, `vbscript:`, and HTML `data:` documents.

Markdown image URLs use a strict default policy. Allowed image sources are `http:`, `https:`, relative URLs, `#hash` / `?query` URLs, protocol-relative URLs, and bitmap `data:image/png|gif|jpg|jpeg|webp|avif|bmp` URLs. Blocked image sources include `javascript:`, `vbscript:`, `data:text/html`, `data:image/svg+xml`, `blob:`, `file:`, and `filesystem:`.

Protocol-relative URLs such as `//cdn.example.com/a.png` are allowed by the URL policy. They can still load external resources, so prefer `htmlPolicy="escape"` for public or third-party content that should not be able to request remote assets.

Mermaid SVG output is sanitized before mounting in both strict and loose Mermaid modes. `isStrict=false` controls Mermaid's parse/render configuration; it does not mean raw SVG insertion.
