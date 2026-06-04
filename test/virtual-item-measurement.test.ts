import { describe, expect, it, vi } from 'vitest'
import {
  getMarkdownItemChromeHeight,
  readElementBoxHeight,
  readElementOuterHeight,
} from '../src/utils/virtualItemMeasurement'

function setElementHeight(element: HTMLElement, height: number) {
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    value: height,
  })
}

describe('virtual item measurement', () => {
  it('reads box height from offsetHeight only', () => {
    const element = document.createElement('div')
    const reads: string[] = []

    setElementHeight(element, 123)
    Object.defineProperty(element, 'scrollHeight', {
      configurable: true,
      get: () => {
        throw new Error('scrollHeight should not be read')
      },
    })
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
      throw new Error('getBoundingClientRect should not be read')
    })

    expect(readElementBoxHeight(element, label => reads.push(label))).toBe(123)
    expect(reads).toEqual(['readElementBoxHeight.offsetHeight'])
  })

  it('keeps vertical margins in outer height', () => {
    const element = document.createElement('div')
    const reads: string[] = []

    element.style.marginTop = '10px'
    element.style.marginBottom = '12px'
    setElementHeight(element, 100)

    expect(readElementOuterHeight(element, label => reads.push(label))).toBe(122)
    expect(reads).toEqual([
      'readElementBoxHeight.offsetHeight',
      'readElementOuterHeight.getComputedStyle',
    ])
  })

  it('reuses measured outer height when computing markdown chrome', () => {
    const wrapper = document.createElement('article')
    const renderer = document.createElement('div')
    const reads: string[] = []

    renderer.className = 'markstream-vue markdown-renderer'
    wrapper.appendChild(renderer)

    setElementHeight(wrapper, 160)
    setElementHeight(renderer, 100)
    vi.spyOn(wrapper, 'getBoundingClientRect').mockImplementation(() => {
      throw new Error('wrapper getBoundingClientRect should not be read')
    })

    expect(getMarkdownItemChromeHeight(wrapper, label => reads.push(label), 160)).toBe(60)
    expect(reads).toEqual(['readElementBoxHeight.offsetHeight'])
  })
})
