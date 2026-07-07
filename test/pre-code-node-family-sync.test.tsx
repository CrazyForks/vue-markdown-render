/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PreCodeNode as ReactPreCodeNode } from '../packages/markstream-react/src/components/CodeBlockNode/PreCodeNode'
import Vue2PreCodeNode from '../packages/markstream-vue2/src/components/PreCodeNode'

const markdownListCode = [
  '# 示例文档',
  '',
  '- 无序项 1',
  '- 无序项 2',
  '  - 子项 A',
  '  - 子项 B',
].join('\n')

const jsonOriginalCode = [
  '{',
  '  "type": "module",',
  '  "version": "1.0.1",',
  '  "description": "old",',
  '  "author": "Simon He"',
  '}',
].join('\n')

const jsonUpdatedCode = [
  '{',
  '  "type": "module",',
  '  "version": "1.0.1",',
  '  "description": "new",',
  '  "author": "Simon He"',
  '}',
].join('\n')

describe('pre code node family sync', () => {
  it('keeps vue2 source diff markdown list rows as added rows', () => {
    const wrapper = mount(Vue2PreCodeNode as any, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'md',
          diff: true,
          originalCode: '',
          updatedCode: markdownListCode,
          code: markdownListCode,
          raw: '',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(0)
    expect(wrapper.findAll('.markstream-pre__diff-line--added')).toHaveLength(6)
    expect(wrapper.find('.markstream-pre__diff-line--empty').classes()).toContain('markstream-pre__diff-line--added')

    wrapper.unmount()
  })

  it('keeps react source diff markdown list rows as added rows', () => {
    const html = renderToStaticMarkup(
      <ReactPreCodeNode
        showLineNumbers
        diffInline
        node={{
          type: 'code_block',
          language: 'md',
          diff: true,
          originalCode: '',
          updatedCode: markdownListCode,
          code: markdownListCode,
          raw: '',
        } as any}
      />,
    )

    expect(html).not.toContain('markstream-pre__diff-line--removed')
    expect((html.match(/markstream-pre__diff-line--added/g) ?? [])).toHaveLength(6)
    expect(html).toContain('markstream-pre__diff-line--added markstream-pre__diff-line--empty')
  })

  it('does not show modified line numbers for family inline removed rows', () => {
    const vueWrapper = mount(Vue2PreCodeNode as any, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'json',
          diff: true,
          originalCode: jsonOriginalCode,
          updatedCode: jsonUpdatedCode,
          code: '',
          raw: '',
        },
      },
    })
    expect(vueWrapper.get('.markstream-pre__diff-line--removed .markstream-pre__diff-number').text()).toBe('')
    expect(vueWrapper.get('.markstream-pre__diff-line--added .markstream-pre__diff-number').text()).toBe('4')
    vueWrapper.unmount()

    const reactHtml = renderToStaticMarkup(
      <ReactPreCodeNode
        showLineNumbers
        diffInline
        node={{
          type: 'code_block',
          language: 'json',
          diff: true,
          originalCode: jsonOriginalCode,
          updatedCode: jsonUpdatedCode,
          code: '',
          raw: '',
        } as any}
      />,
    )
    expect(reactHtml).toContain('<span class="markstream-pre__diff-number" aria-hidden="true"></span>')
    expect(reactHtml).toContain('<span class="markstream-pre__diff-number" aria-hidden="true">4</span>')
  })

  it('keeps vue2 and react diff fallback css aligned with vue3 selectors', () => {
    const vue2Source = readFileSync('packages/markstream-vue2/src/components/PreCodeNode/PreCodeNode.vue', 'utf8')
    const reactCss = readFileSync('packages/markstream-react/src/index.css', 'utf8')

    for (const source of [vue2Source, reactCss]) {
      expect(source).toContain('--markstream-pre-diff-gutter-marker-width: var(--stream-monaco-gutter-marker-width, 4px);')
      expect(source).toContain('--markstream-pre-diff-code-gap: var(--stream-monaco-diff-code-gap, 2px);')
      expect(source).toContain('--markstream-pre-diff-code-padding: var(--stream-monaco-diff-code-padding, 7.8px);')
      expect(source).toContain('--markstream-pre-diff-line-number-padding-left: var(--stream-monaco-line-number-padding-left, 15.6px);')
      expect(source).toContain('--markstream-pre-diff-line-number-padding-right: var(--stream-monaco-line-number-padding-right, 7.8px);')
      expect(source).toContain('--markstream-pre-diff-code-fill-left: calc(')
      expect(source).toContain('--markstream-pre-diff-code-left: calc(')
      expect(source).toContain('grid-template-columns: minmax(100%, max-content);')
      expect(source).toContain('min-width: max-content;')
      expect(source).not.toContain('markstream-pre--diff-inline .markstream-pre__diff-line::after')
      expect(source).not.toContain('left: var(--markstream-pre-diff-scrollable-left);')
      expect(source).toContain('padding-left: var(--markstream-pre-diff-code-left);')
      expect(source).toContain('left: var(--markstream-pre-diff-code-fill-left);')
      expect(source).toContain('padding-left: var(--markstream-pre-diff-line-number-padding-left, 15.6px);')
      expect(source).toContain('padding-right: var(--markstream-pre-diff-line-number-padding-right, 7.8px);')
      expect(source).toContain('width: var(--markstream-pre-diff-gutter-marker-width, 4px);')
      expect(source).toContain('.markstream-pre__diff-line--added > .markstream-pre__diff-number')
      expect(source).toContain('.markstream-pre__diff-line--removed > .markstream-pre__diff-number')
      expect(source).toContain('--markstream-pre-diff-content-height')
      expect(source).toContain('background: var(--stream-monaco-added-line-fill, var(--markstream-diff-added-line-fill, transparent));')
      expect(source).toContain('background: var(--stream-monaco-removed-line-fill, var(--markstream-diff-removed-line-fill, transparent));')
      expect(source).toContain('color: var(--stream-monaco-added-fg, var(--markstream-diff-added-fg,')
      expect(source).toContain('color: var(--stream-monaco-removed-fg, var(--markstream-diff-removed-fg,')
      expect(source).not.toMatch(/markstream-pre__diff-line--added\s*\{\s*color:/)
      expect(source).not.toMatch(/markstream-pre__diff-line--removed\s*\{\s*color:/)
      expect(source).toContain('border-radius: 0;')
      expect(source).not.toContain('markstream-pre__diff-line--added:not(.markstream-pre__diff-line--empty)')
      expect(source).not.toContain('markstream-pre__diff-line--removed:not(.markstream-pre__diff-line--empty)')
    }
  })
})
