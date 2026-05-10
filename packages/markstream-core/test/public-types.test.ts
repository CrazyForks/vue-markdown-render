import type { SmoothMarkdownStreamController } from '../src'
import { describe, expectTypeOf, it } from 'vitest'
import { createSmoothMarkdownStream } from '../src'

describe('public types', () => {
  it('factory return type matches exported controller interface', () => {
    const stream: SmoothMarkdownStreamController = createSmoothMarkdownStream()
    stream.enqueue('hello')
    expectTypeOf(stream).toEqualTypeOf<SmoothMarkdownStreamController>()
  })
})
