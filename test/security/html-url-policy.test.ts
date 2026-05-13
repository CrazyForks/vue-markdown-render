import { describe, expect, it } from 'vitest'
import { sanitizeAttrs } from '../../src/utils/htmlRenderer'

describe('html URL policy', () => {
  it('rejects script protocols with whitespace and control characters', () => {
    expect(sanitizeAttrs({ href: 'java\nscript:alert(1)' }).href).toBeUndefined()
    expect(sanitizeAttrs({ href: 'jav\tascript:alert(1)' }).href).toBeUndefined()
    expect(sanitizeAttrs({ href: 'java\u0000script:alert(1)' }).href).toBeUndefined()
    expect(sanitizeAttrs({ src: 'vb\rscript:msgbox(1)' }).src).toBeUndefined()
  })

  it('rejects unsafe data documents but allows image data URLs', () => {
    expect(sanitizeAttrs({ href: 'data:text/html,<script>alert(1)</script>' }).href).toBeUndefined()
    expect(sanitizeAttrs({ src: 'data:text/html,<script>alert(1)</script>' }).src).toBeUndefined()
    expect(sanitizeAttrs({ href: 'data:image/png;base64,iVBORw0KGgo=' }, 'safe', 'a').href).toBeUndefined()
    expect(sanitizeAttrs({ href: 'data:image/svg+xml,<svg onload=alert(1)>' }, 'safe', 'a').href).toBeUndefined()
    expect(sanitizeAttrs({ src: 'data:image/svg+xml,<svg onload=alert(1)>' }, 'safe', 'img').src).toBeUndefined()
    expect(sanitizeAttrs({ src: 'data:image/png;base64,iVBORw0KGgo=' }, 'safe', 'img').src).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('rejects unsafe srcset candidates', () => {
    expect(sanitizeAttrs({ srcset: 'cover.png 1x, javascript:alert(1) 2x' }, 'safe', 'img').srcset).toBeUndefined()
    expect(sanitizeAttrs({ srcset: 'cover.png 1x, cover@2x.png 2x' }, 'safe', 'img').srcset).toBe('cover.png 1x, cover@2x.png 2x')
  })
})
