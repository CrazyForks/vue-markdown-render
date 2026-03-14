import { describe, expect, it } from 'vitest'
import {
  renderMarkdownNodeToHtml,
  renderMarkdownToHtml,
  renderNestedMarkdownToHtml,
} from '../packages/markstream-angular/src/renderMarkdownHtml'
import { sanitizeHtmlContent as sanitizeHtmlFragment } from '../packages/markstream-angular/src/sanitizeHtmlContent'

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

  it('preserves safe html structures like details and summary', () => {
    const html = renderMarkdownToHtml({
      content: `<details>\n<summary>More</summary>\n<p>Body</p>\n</details>`,
      final: true,
    })

    expect(html).toContain('<details>')
    expect(html).toContain('<summary>More</summary>')
    expect(html).toContain('<p>Body</p>')
    expect(html).toContain('</details>')
  })

  it('keeps top-level thinking nodes intact while streaming html output', () => {
    const html = renderMarkdownToHtml({
      content: '<thinking>我们需要给出一个全面的回答',
      final: false,
      customHtmlTags: ['thinking'],
    })

    expect(html).toContain('data-markstream-custom-tag="thinking"')
    expect(html).toContain('全面的回答')
    expect(html).not.toContain('&lt;thinking&gt;')
  })

  it('emits math source and render shells so KaTeX can refresh incrementally', () => {
    const html = renderMarkdownToHtml({
      content: '$x = a$\n\n$$f(x) = x^2$$',
      final: true,
    })

    expect(html).toContain('markstream-nested-math__source')
    expect(html).toContain('markstream-nested-math__render')
    expect(html).toContain('markstream-nested-math-block__source')
    expect(html).toContain('markstream-nested-math-block__render')
  })

  it('sanitizes dangerous html while preserving safe attributes', () => {
    const html = sanitizeHtmlFragment('<details open onclick="evil()"><summary>Safe</summary><a href="javascript:alert(1)" title="ok">Link</a><script>alert(1)</script></details>')

    expect(html).toContain('<details open>')
    expect(html).toContain('<summary>Safe</summary>')
    expect(html).toContain('<a title="ok">Link</a>')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })
})
