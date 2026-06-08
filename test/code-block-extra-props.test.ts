import { describe, expect, it } from 'vitest'
import { getCodeBlockExtraProps as getReactCodeBlockExtraProps } from '../packages/markstream-react/src/renderers/codeBlockExtraProps'
import { getCodeBlockExtraProps as getVue2CodeBlockExtraProps } from '../packages/markstream-vue2/src/utils/codeBlockExtraProps'
import { getCodeBlockExtraProps as getVueCodeBlockExtraProps } from '../src/utils/codeBlockExtraProps'

const implementations = [
  ['Vue', getVueCodeBlockExtraProps],
  ['React', getReactCodeBlockExtraProps],
  ['Vue2', getVue2CodeBlockExtraProps],
] as const

describe('getCodeBlockExtraProps', () => {
  it.each(implementations)('%s does not invoke accessors while copying extra props', (_, getCodeBlockExtraProps) => {
    let getterCalled = false
    const source = {
      showHeader: false,
      node: 'reserved',
      get dangerous() {
        getterCalled = true
        throw new Error('getter should not run')
      },
    }

    expect(getCodeBlockExtraProps(source)).toEqual({
      showHeader: false,
    })
    expect(getterCalled).toBe(false)
  })

  it.each(implementations)('%s omits caller-specified props', (_, getCodeBlockExtraProps) => {
    expect(getCodeBlockExtraProps({
      langs: ['typescript'],
      showHeader: false,
    }, { omit: ['langs'] })).toEqual({
      showHeader: false,
    })
  })
})
