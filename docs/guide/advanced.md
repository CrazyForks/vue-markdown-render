# Advanced customization — parseOptions & custom nodes

This page explains how to customize parsing and provide scoped custom components.

## parseOptions
`parseOptions` can be passed to `MarkdownRender` or used directly with `parseMarkdownToStructure`.

- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — mutate tokens immediately after the `markdown-it` parse
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — further token transforms
- `postTransformNodes?: (nodes: ParsedNode[]) => ParsedNode[]` — manipulate final node tree

### Example: token transform
```ts
function pre(tokens) {
  // Convert <thinking> HTML blocks to thinking node
  return tokens.map(t => t.type === 'html_block' && /<thinking>/.test(t.content || '')
    ? { ...t, type: 'thinking_block', content: t.content.replace(/<\/?.+?>/g, '') }
    : t
  )
}

const nodes = parseMarkdownToStructure(markdown, md, { preTransformTokens: pre })
```

## setCustomComponents(id, mapping)
- Use `setCustomComponents('docs', { thinking: ThinkingComponent })` to scope to `MarkdownRender` instances with `custom-id="docs"`.
- Call `removeCustomComponents` to clean up mappings and avoid memory leaks in single-page apps.

## Scoped example
```vue
<MarkdownRender content="..." custom-id="docs" />
// In setup
setCustomComponents('docs', { thinking: ThinkingNode })
```

Advanced hooks are a powerful way to add domain-specific grammar to Markdown without changing the core parser.

### Typewriter prop

`MarkdownRender` accepts a `typewriter` boolean prop which controls whether non-`code_block` nodes are wrapped with a small enter transition. This is useful for demo UIs but may be undesirable in SSR or print/export flows where deterministic output is needed.

Example:

```vue
<MarkdownRender :content="markdown" :typewriter="false" />
```

CSS variables: `--typewriter-fade-duration` and `--typewriter-fade-ease` are available for theme tuning.

## Internationalization (i18n)

By default, `getMarkdown` uses English text for UI elements (e.g., "Copy" button in code blocks). You can customize these texts by providing an `i18n` option:

**Using a translation map:**

```ts
import { getMarkdown } from 'markstream-vue'

const md = getMarkdown('editor-1', {
  i18n: {
    'common.copy': '复制',
  }
})
```

**Using a translation function:**

```ts
import { getMarkdown } from 'markstream-vue'
import { useI18n } from 'vue-i18n' // or any i18n library

const { t } = useI18n()

const md = getMarkdown('editor-1', {
  i18n: (key: string) => t(key)
})
```

**Default translations:**

- `common.copy`: "Copy" — Used in code block copy buttons

This design keeps the markdown utilities pure and free from global side effects, allowing you to integrate with any i18n solution or provide static translations.
