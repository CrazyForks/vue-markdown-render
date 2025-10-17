import { defineAsyncComponent, h } from 'vue'
import { getKatex } from '../MathInlineNode/katex'
import TextNode from '../TextNode'

export const MathInlineNodeAsync = defineAsyncComponent(async () => {
  try {
    const katex = await getKatex()
    if (katex) {
      const mod = await import('../../components/MathInlineNode')
      return mod.default
    }
  }
  catch (e) {
    console.warn(
      '[vue-markdown-render] Optional peer dependencies for MathInlineNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      e,
    )
  }
  return (props) => {
    return h(TextNode, {
      ...props,
      node: {
        ...props.node,
        content: props.node.raw,
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
      '[vue-markdown-render] Optional peer dependencies for MathBlockNode are missing. Falling back to text rendering. To enable full math rendering features, please install "katex".',
      e,
    )
  }
  return (props) => {
    return h(TextNode, {
      ...props,
      node: {
        ...props.node,
        content: props.node.raw,
      },
    })
  }
})
