import { sanitizeHtmlContent } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('sanitizeHtmlContent', () => {
  it('removes dangerous attrs, unsafe urls, and blocked tags', () => {
    const html = sanitizeHtmlContent('<div onclick="evil()">Hello <img src="x" onerror="evil()"><a href="javascript:alert(1)" title="ok">Link</a><script>alert(1)</script></div>')

    expect(html).toContain('<div>Hello <img src="x"><a title="ok">Link</a></div>')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('uses the safe HTML policy by default', () => {
    const html = sanitizeHtmlContent('<div>Safe</div><iframe src="https://example.com"></iframe><object data="/x"></object><style>body{color:red}</style><form><button>Submit</button></form><input value="x"><select><option>One</option></select><dialog>Modal</dialog>')

    expect(html).toBe('<div>Safe</div>')
  })

  it('can preserve broader HTML tags for trusted content', () => {
    const html = sanitizeHtmlContent('<iframe src="https://example.com"></iframe><style>body{color:red}</style><script>alert(1)</script>', 'trusted')

    expect(html).toContain('<iframe src="https://example.com"></iframe>')
    expect(html).toContain('<style>body{color:red}</style>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert(1)')
  })

  it('can escape HTML instead of rendering it', () => {
    const html = sanitizeHtmlContent('<iframe src="https://example.com">x</iframe>', 'escape')

    expect(html).toBe('&lt;iframe src=&quot;https://example.com&quot;&gt;x&lt;/iframe&gt;')
  })

  it('preserves whitespace around safe inline html', () => {
    const html = sanitizeHtmlContent('Hello <span data-safe="1">world</span> !')

    expect(html).toBe('Hello <span data-safe="1">world</span> !')
  })
})
