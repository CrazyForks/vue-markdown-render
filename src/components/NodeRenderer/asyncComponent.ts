import { defineAsyncComponent, h } from 'vue'
import { getKatex } from '../MathInlineNode/katex'
import TextNode from '../TextNode'

export const MathInlineNodeAsync = defineAsyncComponent(async () => {
  // In test environment prefer the simple text fallback to avoid
  // race conditions with workers/KaTeX rendering.
  const isTestEnv = typeof globalThis !== 'undefined'
    // eslint-disable-next-line node/prefer-global/process
    && typeof (globalThis as any).process !== 'undefined'
    // eslint-disable-next-line node/prefer-global/process
    && (globalThis as any).process?.env?.NODE_ENV === 'test'
  if (isTestEnv) {
    return (props) => {
      // test fallback should be deterministic and minimal
      return h(TextNode, {
        ...props,
        node: {
          ...props.node,
          content: props.node.raw ?? `$${props.node.content ?? ''}$`,
        },
      })
    }
  }

  try {
    const katex = await getKatex()
    if (katex) {
      const mod = await import('../../components/MathInlineNode')
      return mod.default
    }
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for MathInlineNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      e,
    )
  }
  return (props) => {
    return h(TextNode, {
      ...props,
      node: {
        ...props.node,
        content: props.node.raw ?? `$${props.node.content ?? ''}$`,
      },
    })
  }
})

export const MathBlockNodeAsync = defineAsyncComponent(async () => {
  try {
    const katex = await getKatex()
    if (katex) {
      const mod = await import('../../components/MathBlockNode')
      return mod.default
    }
  }
  catch (e) {
    console.warn(
      '[markstream-vue] Optional peer dependencies for MathBlockNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      e,
    )
  }
  return (props) => {
    return h(TextNode, {
      ...props,
      node: {
        ...props.node,
        content: props.node.raw ?? `$$${props.node.content ?? ''}$$`,
      },
    })
  }
})
