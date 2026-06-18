import { describe, expect, it } from 'vitest'
import { hasOfferPrice } from '../scripts/check-docs-seo-output.mjs'

describe('docs SEO offer price validation', () => {
  it('accepts non-negative numeric prices and numeric strings', () => {
    expect(hasOfferPrice({ price: 0 })).toBe(true)
    expect(hasOfferPrice({ price: 1.99 })).toBe(true)
    expect(hasOfferPrice({ price: '0' })).toBe(true)
    expect(hasOfferPrice({ price: '1.99' })).toBe(true)
    expect(hasOfferPrice({ price: 'free' })).toBe(false)
    expect(hasOfferPrice({})).toBe(false)
  })
})
