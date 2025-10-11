import { expect, it } from 'vitest'
import { isMathLike } from '../../src/utils/markdown/plugins/math'

it('recognizes \"\\boldsymbol{...}\" as math-like', () => {
  expect(isMathLike('\\boldsymbol{\\beta}')).toBe(true)
  expect(isMathLike('\\(C++\\)')).toBe(false)
  expect(isMathLike('\\(W\\)')).toBe(false)
  expect(isMathLike('\\(f^{(k)}(a)\\)')).toBe(true)
  expect(isMathLike('\\(W^\perp\\)')).toBe(true)
  expect(isMathLike('\\(2025/9/30 21:37:24\\)')).toBe(false)
  expect(isMathLike('operatorname{')).toBe(true)
})
