import { describe, expect, it } from 'vitest'
import { LRUCache } from '../../src/utils/lru'

describe('lRUCache', () => {
  it('stores and retrieves and updates recency', () => {
    const c = new LRUCache<string, number>(2)
    c.set('a', 1)
    c.set('b', 2)
    // access 'a' to make 'b' the oldest
    expect(c.get('a')).toBe(1)
    c.set('c', 3)
    // 'b' should have been evicted
    expect(c.get('b')).toBe(undefined)
    expect(c.get('a')).toBe(1)
    expect(c.get('c')).toBe(3)
  })

  it('getOrCreate creates and caches value', () => {
    const c = new LRUCache<string, number>(2)
    let calls = 0
    const v1 = c.getOrCreate('x', () => {
      calls++
      return 42
    })
    const v2 = c.getOrCreate('x', () => {
      calls++
      return 43
    })
    expect(v1).toBe(42)
    expect(v2).toBe(42)
    expect(calls).toBe(1)
  })

  it('evicts oldest when size exceeded', () => {
    const c = new LRUCache<string, number>(1)
    c.set('a', 1)
    c.set('b', 2)
    expect(c.get('a')).toBe(undefined)
    expect(c.get('b')).toBe(2)
  })
})
