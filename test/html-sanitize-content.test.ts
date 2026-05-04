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

  it('escapes unknown tags and removes style in safe mode', () => {
    const html = sanitizeHtmlContent('<unknown-tag style="position:fixed">Hello</unknown-tag><span style="color:red">World</span>')

    expect(html).toContain('&lt;unknown-tag style="position:fixed"&gt;Hello&lt;/unknown-tag&gt;')
    expect(html).toContain('<span>World</span>')
    expect(html).not.toContain('<span style=')
  })

  it('sanitizes srcset candidates instead of treating the whole value as one URL', () => {
    const safeHtml = sanitizeHtmlContent('<img src="cover.jpg" srcset="cover-1x.jpg 1x, cover-2x.jpg 2x">')
    const unsafeHtml = sanitizeHtmlContent('<img src="cover.jpg" srcset="javascript:alert(1) 1x, cover-2x.jpg 2x">')

    expect(safeHtml).toContain('srcset="cover-1x.jpg 1x, cover-2x.jpg 2x"')
    expect(unsafeHtml).toBe('<img src="cover.jpg">')
  })

  it('can preserve broader HTML tags for trusted content', () => {
    const html = sanitizeHtmlContent('<iframe src="https://example.com"></iframe><style>body{color:red}</style><span style="color:red">Styled</span><script>alert(1)</script>', 'trusted')

    expect(html).toContain('<iframe src="https://example.com"></iframe>')
    expect(html).toContain('<style>body{color:red}</style>')
    expect(html).toContain('<span style="color:red">Styled</span>')
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
