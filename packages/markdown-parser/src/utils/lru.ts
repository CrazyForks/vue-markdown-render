// Lightweight LRU cache used by parser modules to bound memory for
// dynamically-created RegExp and other small cached objects.
export class LRUCache<K, V> {
  private max: number
  private map: Map<K, V>

  constructor(max = 500) {
    this.max = max
    this.map = new Map()
  }

  get(key: K): V | undefined {
    if (!this.map.has(key))
      return undefined
    const val = this.map.get(key) as V
    // mark as recently used
    this.map.delete(key)
    this.map.set(key, val)
    return val
  }

  set(key: K, value: V): void {
    if (this.map.has(key))
      this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.max) {
      const iter = this.map.keys()
      const firstKey = iter.next().value
      if (firstKey !== undefined)
        this.map.delete(firstKey as K)
    }
  }

  // convenience: get or create via factory
  getOrCreate(key: K, factory: () => V): V {
    const existing = this.get(key)
    if (existing !== undefined)
      return existing
    const v = factory()
    this.set(key, v)
    return v
  }
}
