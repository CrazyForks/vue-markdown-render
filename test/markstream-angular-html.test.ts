import { describe, expect, it } from 'vitest'
import {
  renderMarkdownNodeToHtml,
  renderMarkdownToHtml,
  renderNestedMarkdownToHtml,
} from '../packages/markstream-angular/src/renderMarkdownHtml'

describe('markstream-angular html renderer', () => {
  it('renders markdown content into stable html for baseline blocks', () => {
    const html = renderMarkdownToHtml({
      content: `# Angular\n\n- one\n- two\n\n\`\`\`ts\nconst value = 1\n\`\`\``,
      final: true,
    })

    expect(html).toContain('<h1>Angular</h1>')
    expect(html).toContain('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
    expect(html).toContain('data-markstream-code-block="1"')
    expect(html).toContain('data-markstream-language="ts"')
    expect(html).toContain('class="language-ts"')
    expect(html).toContain('const value = 1')
  })

  it('preserves diff metadata on code fences for advanced enhancers', () => {
    const html = renderMarkdownToHtml({
      content: `\`\`\`diff ts
-const value = 1
+const value: number = 1
\`\`\``,
      final: true,
    })

    expect(html).toContain('data-markstream-diff="1"')
    expect(html).toContain('data-markstream-original="')
    expect(html).toContain('data-markstream-updated="')
    expect(html).toContain('data-markstream-language="ts"')
  })

  it('renders nested custom nodes with merged classes', () => {
    const html = renderNestedMarkdownToHtml(
      {
        nodes: [
          {
            type: 'thinking',
            tag: 'thinking',
            raw: '',
            attrs: [['class', 'preset']],
            children: [
              {
                type: 'paragraph',
                raw: '',
                children: [
                  { type: 'text', raw: '', content: 'Inner ' },
                  {
                    type: 'strong',
                    raw: '',
                    children: [{ type: 'text', raw: '', content: 'bold' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        customHtmlTags: ['thinking'],
        customNodeClass: 'thinking-node__nested',
      },
    )

    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('data-markstream-custom-tag="thinking"')
    expect(html).toContain('class="markstream-nested-custom markstream-nested-custom--thinking thinking-node__nested preset"')
  })

  it('escapes incomplete html nodes instead of trusting partial markup', () => {
    const html = renderMarkdownNodeToHtml(
      {
        type: 'html_inline',
        raw: '',
        content: '<span>partial',
        loading: true,
        autoClosed: false,
      } as any,
    )

    expect(html).toBe('&lt;span&gt;partial')
  })
})
