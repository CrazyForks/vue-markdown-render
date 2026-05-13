# Security

`MarkdownRender` defaults to `htmlPolicy="safe"`. This is the right default for AI output and other content that should allow a small, sanitized HTML subset.

## HTML policies

### `htmlPolicy="safe"`

Allows common structural HTML such as links, images, lists, tables, and details blocks. Dangerous tags, event attributes, unsafe URL protocols, and inline styles are removed or escaped before rendering.

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

Markdown links and rendered HTML attrs are checked for unsafe protocols such as `javascript:`, `vbscript:`, and HTML `data:` documents. Bitmap image data URLs are allowed only on image source attributes.
