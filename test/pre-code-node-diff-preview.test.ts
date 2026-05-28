import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PreCodeNode from '../src/components/PreCodeNode'

describe('pre code node diff preview', () => {
  it('does not paint blank diff preview rows as added or removed', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'const a = 1\n',
          updatedCode: 'const a = 2\n',
          code: '',
          raw: '',
        },
      },
    })

    const emptyRows = wrapper.findAll('.markstream-pre__diff-line--empty')

    expect(emptyRows.length).toBeGreaterThan(0)
    for (const row of emptyRows) {
      expect(row.classes()).toContain('markstream-pre__diff-line--context')
      expect(row.classes()).not.toContain('markstream-pre__diff-line--added')
      expect(row.classes()).not.toContain('markstream-pre__diff-line--removed')
    }

    wrapper.unmount()
  })
})
