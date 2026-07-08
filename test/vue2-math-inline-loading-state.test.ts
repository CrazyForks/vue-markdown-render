import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('markstream-vue2 MathInlineNode loading state', () => {
  it('keeps empty loading inline math in loading mode instead of raw fallback', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/markstream-vue2/src/components/MathInlineNode/MathInlineNode.vue'),
      'utf8',
    )

    expect(source).toContain('fallbackText.value = props.node.loading ? \'\' : props.node.raw')
    expect(source).toContain('renderingLoading.value = !!props.node.loading')
    expect(source).toContain('hasRenderedOnce = !props.node.loading')
    expect(source).not.toContain(`if (!props.node.content) {
    applyRawFallback()
    hasRenderedOnce = true
    return
  }`)
  })
})
