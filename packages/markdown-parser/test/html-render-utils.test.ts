import { describe, expect, it } from 'vitest'
import { hasCustomHtmlComponents, tokenizeHtml } from '../src'

describe('html render utilities', () => {
  it('detects custom tags across valid HTML whitespace boundaries', () => {
    const customComponents = {
      badge: true,
      my_component: true,
    }

    expect(hasCustomHtmlComponents('<badge kind="x">text</badge>', customComponents)).toBe(true)
    expect(hasCustomHtmlComponents('<badge\tkind="x">text</badge>', customComponents)).toBe(true)
    expect(hasCustomHtmlComponents('<badge\n  kind="x"\n>text</badge>', customComponents)).toBe(true)
    expect(hasCustomHtmlComponents('<my_component kind="x">text</my_component>', customComponents)).toBe(true)
    expect(hasCustomHtmlComponents('< badge>text</badge>', customComponents)).toBe(false)
  })

  it('tokenizes tag names and attrs with HTML whitespace boundaries', () => {
    expect(tokenizeHtml('<badge\tkind="x">text</badge>')[0]).toMatchObject({
      attrs: { kind: 'x' },
      tagName: 'badge',
      type: 'tag_open',
    })
    expect(tokenizeHtml('<badge\n  kind="x"\n>text</badge>')[0]).toMatchObject({
      attrs: { kind: 'x' },
      tagName: 'badge',
      type: 'tag_open',
    })
    expect(tokenizeHtml('<my_component kind="x">text</my_component>')[0]).toMatchObject({
      attrs: { kind: 'x' },
      tagName: 'my_component',
      type: 'tag_open',
    })
    expect(tokenizeHtml('< badge>text</badge>')[0]).toMatchObject({
      content: '< badge>',
      type: 'text',
    })
  })
})
