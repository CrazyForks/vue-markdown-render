/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'
import { setNormalizedElementScrollTop } from '../src/utils/normalizedScroll'

function createScrollableRoot(max: number) {
  const root = document.createElement('div')

  Object.defineProperty(root, 'scrollHeight', {
    configurable: true,
    value: max + 100,
  })
  Object.defineProperty(root, 'clientHeight', {
    configurable: true,
    value: 100,
  })

  return root
}

describe('setNormalizedElementScrollTop', () => {
  it('clamps normal element scroll roots', () => {
    const root = createScrollableRoot(600)

    setNormalizedElementScrollTop(root, document, 800, {
      isReverseFlexScrollRoot: () => false,
      getNormalizedScrollTop: node => node.scrollTop,
    })

    expect(root.scrollTop).toBe(600)
  })

  it('keeps the negative reverse-flex candidate when it has less drift', () => {
    const root = createScrollableRoot(1000)

    setNormalizedElementScrollTop(root, document, 300, {
      isReverseFlexScrollRoot: () => true,
      getNormalizedScrollTop: (node) => {
        return node.scrollTop < 0
          ? 1000 + node.scrollTop
          : 1000
      },
    })

    expect(root.scrollTop).toBe(-700)
  })

  it('keeps the positive reverse-flex candidate when it has less drift', () => {
    const root = createScrollableRoot(1000)

    setNormalizedElementScrollTop(root, document, 300, {
      isReverseFlexScrollRoot: () => true,
      getNormalizedScrollTop: (node) => {
        return node.scrollTop >= 0
          ? 1000 - node.scrollTop
          : 1000
      },
    })

    expect(root.scrollTop).toBe(700)
  })
})
