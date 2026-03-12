import { describe, expect, it } from 'vitest'
import { createMarkdownHash, decodeMarkdownHash, resolveFrameworkTestHref, withMarkdownHash } from '../playground-shared/testPageState'

describe('playground test page state helpers', () => {
  it('round-trips markdown through hash payloads', () => {
    const markdown = '# Hello\n\n- Vue 3\n- Vue 2\n- React'
    const hash = createMarkdownHash(markdown)

    expect(hash).toMatch(/^data=/)
    expect(decodeMarkdownHash(hash)).toBe(markdown)
    expect(decodeMarkdownHash(`#${hash}`)).toBe(markdown)
  })

  it('adds markdown hash to relative and absolute test urls', () => {
    const markdown = '## Cross framework'

    expect(withMarkdownHash('/test', markdown)).toContain('/test#data=')
    expect(withMarkdownHash('https://markstream-react.pages.dev/test', markdown)).toContain('#data=')
  })

  it('prefers localhost target when matching playground ports are available', () => {
    const href = resolveFrameworkTestHref(
      {
        id: 'react',
        origin: 'https://markstream-react.pages.dev',
        localPort: 4174,
      },
      'vue3',
      'same input',
      { hostname: 'localhost', protocol: 'http:' },
    )

    expect(href).toMatch(/^http:\/\/localhost:4174\/test#data=/)
  })
})
