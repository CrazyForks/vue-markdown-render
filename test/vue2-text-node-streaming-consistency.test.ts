import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('markstream-vue2 text node streaming consistency', () => {
  it('keeps the stale-delta settle hook wired to outer stream ticks', () => {
    const nodeRendererSource = readFileSync(
      resolve(process.cwd(), 'packages/markstream-vue2/src/components/NodeRenderer/NodeRenderer.vue'),
      'utf8',
    )
    const textNodeSource = readFileSync(
      resolve(process.cwd(), 'packages/markstream-vue2/src/components/TextNode/TextNode.vue'),
      'utf8',
    )

    expect(nodeRendererSource).toContain('const streamRenderVersion = ref(0)')
    expect(nodeRendererSource).toContain('provide(\'markstreamStreamVersion\', streamRenderVersion)')
    expect(nodeRendererSource).toContain('[() => props.content, () => props.nodes]')

    expect(textNodeSource).toContain('inject<{ value?: number } | undefined>(\'markstreamStreamVersion\', undefined)')
    expect(textNodeSource).toContain('[() => props.node.content, streamStateKey, typewriterEnabled, () => inheritedStreamVersion?.value]')
    expect(textNodeSource).toContain('if (normalized === previousContent)')
    expect(textNodeSource).toContain('if (streamedDelta.value)')
    expect(textNodeSource).toContain('settleStreamedDelta()')
  })
})
